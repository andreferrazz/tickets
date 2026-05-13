defmodule Backend.Accounts do
  @moduledoc """
  Authentication and user management.

  Provides passwordless auth (email → 6-digit code → session token) and
  user creation with automatic role promotion when an invitation exists.
  """

  import Ecto.Query
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
    # Check for a pending invitation addressed to this email.
    invite =
      Repo.one(
        from i in Backend.Invitations.Invitation,
          where: i.email == ^user.email and i.status == "pending"
      )

    if invite do
      Repo.transaction(fn ->
        {:ok, updated} =
          user
          |> User.changeset(%{role: "creator", invited_by: invite.inviter_id})
          |> Repo.update()

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
