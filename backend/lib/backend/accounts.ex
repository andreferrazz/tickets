defmodule Backend.Accounts do
  @moduledoc """
  Authentication and user management.

  Provides passwordless auth (email → 6-digit code → session token) and
  user creation with automatic role promotion when an invitation exists.
  """

  import Ecto.Query
  require Logger
  alias Backend.Repo
  alias Backend.Accounts.{AuthCode, Session, User}
  alias Backend.Mailer

  @code_ttl_minutes 10
  @session_ttl_days 30

  # ---------------------------------------------------------------------------
  # Auth code
  # ---------------------------------------------------------------------------

  @doc """
  Generates and stores a 6-digit auth code for `email`, then sends it.

  Returns `{:ok, code}` (code exposed for testing/logging) or `{:error, reason}`.
  """
  def request_code(email) do
    email = String.downcase(String.trim(email))
    code = generate_code()
    expires_at = DateTime.add(DateTime.utc_now(), @code_ttl_minutes * 60, :second)

    # Invalidate previous unused codes for this email.
    Repo.delete_all(from ac in AuthCode, where: ac.email == ^email and ac.used == false)

    changeset = AuthCode.changeset(%{email: email, code: code, expires_at: expires_at})

    with {:ok, _} <- Repo.insert(changeset),
         :ok <- Mailer.send_auth_code(email, code) do
      {:ok, code}
    end
  end

  # ---------------------------------------------------------------------------
  # Verify code
  # ---------------------------------------------------------------------------

  @doc """
  Validates the code for `email`. On success finds or creates the user,
  promotes buyer→creator if a pending invitation exists, and returns a session
  token.

  Returns `{:ok, %{token: token, user: user}}` or `{:error, reason}`.
  """
  def verify_code(email, code) do
    email = String.downcase(String.trim(email))
    now = DateTime.utc_now()

    with {:ok, auth_code} <- fetch_valid_code(email, code, now),
         {:ok, user} <- find_or_create_user(email),
         {:ok, user} <- maybe_promote_to_creator(user),
         {:ok, token} <- create_session(user),
         _ <- mark_code_used(auth_code) do
      {:ok, %{token: token, user: user}}
    end
  end

  # ---------------------------------------------------------------------------
  # Session management
  # ---------------------------------------------------------------------------

  @doc "Deletes the session for `token`. Always succeeds."
  def logout(token) do
    Repo.delete_all(from s in Session, where: s.token == ^token)
    :ok
  end

  @doc "Returns the user associated with `token` if the session is valid, else nil."
  def get_user_by_token(token) do
    now = DateTime.utc_now()

    query =
      from s in Session,
        join: u in User,
        on: s.user_id == u.id,
        where: s.token == ^token and s.expires_at > ^now,
        select: u

    Repo.one(query)
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp generate_code do
    :rand.uniform(900_000)
    |> Kernel.+(100_000)
    |> Integer.to_string()
  end

  defp fetch_valid_code(email, code, now) do
    auth_code =
      Repo.one(
        from ac in AuthCode,
          where:
            ac.email == ^email and
              ac.code == ^code and
              ac.used == false and
              ac.expires_at > ^now
      )

    case auth_code do
      nil -> {:error, :invalid_or_expired_code}
      ac -> {:ok, ac}
    end
  end

  defp find_or_create_user(email) do
    case Repo.get_by(User, email: email) do
      %User{} = user ->
        {:ok, user}

      nil ->
        %User{}
        |> User.changeset(%{email: email, role: "buyer"})
        |> Repo.insert()
    end
  end

  defp maybe_promote_to_creator(%User{role: "buyer"} = user) do
    now = DateTime.utc_now()

    invite =
      Repo.one(
        from i in Backend.Invitations.Invitation,
          where: i.email == ^user.email and i.status == "pending" and i.expires_at > ^now
      )

    if invite do
      Repo.transaction(fn ->
        updated = promote_or_keep(user, invite)

        case attach_membership(invite, updated) do
          {:ok, _} -> :ok
          {:error, reason} -> Repo.rollback(reason)
        end

        invite
        |> Ecto.Changeset.change(status: "accepted")
        |> Repo.update!()

        updated
      end)
    else
      {:ok, user}
    end
  end

  defp maybe_promote_to_creator(user), do: {:ok, user}

  # Staff invitations never grant the global `creator` role — staff may only
  # scan, so they stay `buyer` (which keeps the `:creator` router pipeline
  # blocking them). Every other invited role is promoted buyer→creator.
  defp promote_or_keep(user, %{role: "staff"}), do: user

  defp promote_or_keep(user, invite) do
    {:ok, updated} =
      user
      |> User.changeset(%{role: "creator", invited_by: invite.inviter_id})
      |> Repo.update()

    updated
  end

  # ---------------------------------------------------------------------------
  # Profile completion + Abacate Pay customer
  # ---------------------------------------------------------------------------

  @doc """
  Registers the user as an Abacate Pay customer and persists all four fields
  (name, cellphone, tax_id, abacate_customer_id) in a single update.

  Validates input first via `User.profile_changeset/2` without touching the DB.
  Only writes to the row when Abacate Pay returns `{:ok, cust_id}`. On failure
  nothing is persisted — the caller is expected to surface the error and retry.

  Returns:
    * `{:ok, user}` on success.
    * `{:error, %Ecto.Changeset{}}` when local validation fails.
    * `{:error, :invalid_profile_data}` when Abacate Pay rejects the data (4xx).
    * `{:error, :abacate_unavailable}` for transport or upstream 5xx failures.
  """
  def complete_profile(%User{} = user, attrs) do
    changeset = User.profile_changeset(user, attrs)

    with {:ok, profile} <- Ecto.Changeset.apply_action(changeset, :update),
         {:ok, cust_id} <- create_abacate_customer(user.email, profile) do
      changeset
      |> Ecto.Changeset.put_change(:abacate_customer_id, cust_id)
      |> Repo.update()
    end
  end

  defp create_abacate_customer(email, %{name: name, cellphone: cellphone, tax_id: tax_id}) do
    case abacate_pay().create_customer(email, name, cellphone, tax_id) do
      {:ok, id} ->
        {:ok, id}

      {:error, reason} ->
        Logger.warning("abacate customer create failed reason=#{inspect(reason)}")
        {:error, classify_abacate_error(reason)}
    end
  end

  defp classify_abacate_error({:invalid_data, _status, _msg}), do: :invalid_profile_data
  defp classify_abacate_error({:invalid_data, 401, _msg}), do: :abacate_unavailable
  defp classify_abacate_error(_other), do: :abacate_unavailable

  defp abacate_pay,
    do: Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)

  # ---------------------------------------------------------------------------
  # Invitation acceptance (token link flow)
  # ---------------------------------------------------------------------------

  @doc """
  Consumes a validated invitation: finds-or-creates the user, promotes buyer→
  creator (already-creator/admin users keep their role), marks the invitation
  accepted, and returns a session token.

  Caller (`Backend.Invitations.accept_invitation/1`) is responsible for token
  lookup, expiry, and already-accepted checks.
  """
  def accept_invitation(%Backend.Invitations.Invitation{} = invitation) do
    Repo.transaction(fn ->
      with {:ok, user} <- find_or_create_user(invitation.email),
           {:ok, user} <- apply_invitation_role(user, invitation),
           {:ok, _membership} <- attach_membership(invitation, user),
           {:ok, _} <- mark_invitation_accepted(invitation),
           {:ok, token} <- create_session(user),
           {:ok, organization} <- load_invitation_org(invitation) do
        %{
          token: token,
          user: user,
          organization: %{
            id: organization.id,
            name: organization.name,
            role: invitation.role
          }
        }
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp load_invitation_org(invitation) do
    case Repo.get(Backend.Organizations.Organization, invitation.organization_id) do
      nil -> {:error, :organization_missing}
      org -> {:ok, org}
    end
  end

  # A `staff` invitation must not promote the user — they stay `buyer` and only
  # gain the scan-only membership attached separately by `attach_membership/2`.
  defp apply_invitation_role(%User{role: "buyer"} = user, %{role: "staff"}), do: {:ok, user}

  defp apply_invitation_role(%User{role: "buyer"} = user, invitation) do
    user
    |> User.changeset(%{role: "creator", invited_by: invitation.inviter_id})
    |> Repo.update()
  end

  defp apply_invitation_role(%User{} = user, _invitation), do: {:ok, user}

  defp attach_membership(invitation, user) do
    case Backend.Organizations.add_member(
           invitation.organization_id,
           user.id,
           invitation.role
         ) do
      {:ok, membership} -> {:ok, membership}
      # Idempotent re-acceptance: already a member is a non-error from the
      # caller's perspective. We still return success so the session token is
      # still issued and the invitation marked accepted.
      {:error, :already_member} -> {:ok, :already_member}
      {:error, reason} -> {:error, reason}
    end
  end

  defp mark_invitation_accepted(invitation) do
    invitation
    |> Ecto.Changeset.change(status: "accepted")
    |> Repo.update()
  end

  defp create_session(user) do
    token = generate_token()
    expires_at = DateTime.add(DateTime.utc_now(), @session_ttl_days * 86_400, :second)

    changeset =
      Session.changeset(%{
        user_id: user.id,
        token: token,
        expires_at: expires_at
      })

    case Repo.insert(changeset) do
      {:ok, _} -> {:ok, token}
      {:error, cs} -> {:error, cs}
    end
  end

  defp mark_code_used(auth_code) do
    auth_code
    |> Ecto.Changeset.change(used: true)
    |> Repo.update()
  end

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
