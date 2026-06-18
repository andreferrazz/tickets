defmodule Backend.Invitations do
  @moduledoc """
  Org-scoped invitations.

  A pending invitation always names an organization and a role. There are two
  ways an invitation is created:

    * **Admin → new leader**: an admin invites someone to start a new
      organization. The org is created synchronously when the invitation is
      sent, the role is `"leader"`, and the new user becomes the leader once
      they accept.

    * **Leader → new participant**: a leader invites someone to their own
      organization. The role is `"participant"`. Participants cannot invite
      others, so a leader is always the inviter on this branch.

  Acceptance is consumed via a 24-hour tokenized link:
  `accept_invitation/1` validates the token and delegates to
  `Backend.Accounts.accept_invitation/1`, which finds-or-creates the user and
  inserts the membership in a single transaction.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Invitations.Invitation
  alias Backend.Mailer
  alias Backend.Accounts
  alias Backend.Organizations
  alias Backend.Organizations.Membership

  @token_ttl_hours 24

  @doc """
  Creates a pending invitation from `inviter` to `email`.

  Required attrs depend on the inviter's role:

    * admin — `"organization_name"` is optional. When omitted (or blank), the
      new org is named `"<email-local-part>'s Org"`; the new leader can
      rename it via `PATCH /api/v1/organizations/:id` after accepting.
    * leader — `"organization_id"` (optional if they lead exactly one org).

  Returns `{:error, :forbidden}` if the inviter is neither an admin nor a
  leader of some organization, `{:error, :organization_id_required}` if a
  leader has multiple orgs and didn't pass one, `{:error, :already_invited}`
  if a pending invitation for the same email already exists, and
  `{:error, :already_member}` if the email belongs to an existing user who is
  already in the target org.
  """
  def create_invitation(inviter, attrs) when is_map(attrs) do
    email = attrs |> get_field("email") |> normalize_email()

    with {:ok, email} <- validate_email(email),
         {:ok, organization_id, role} <- resolve_target(inviter, attrs, email),
         :ok <- assert_email_not_already_member(email, organization_id),
         :ok <- assert_no_active_pending(email) do
      insert_invitation(inviter, email, organization_id, role)
    end
  end

  # Backwards-compatible 2-arity with a bare email — used by older callers and
  # is sufficient when the leader belongs to a single org.
  def create_invitation(inviter, email) when is_binary(email) do
    create_invitation(inviter, %{"email" => email})
  end

  defp resolve_target(%{role: "admin"}, attrs, email) do
    name = attrs |> get_field("organization_name") |> trim_or_nil() || default_org_name(email)

    case Organizations.create_organization(%{name: name}) do
      {:ok, org} -> {:ok, org.id, "leader"}
      {:error, cs} -> {:error, cs}
    end
  end

  defp resolve_target(inviter, attrs, _email) do
    with {:ok, role} <- member_role(attrs) do
      case get_field(attrs, "organization_id") do
        nil ->
          case Organizations.list_led_by(inviter.id) do
            [org] -> {:ok, org.id, role}
            [] -> {:error, :forbidden}
            _ -> {:error, :organization_id_required}
          end

        org_id ->
          if Organizations.leader?(inviter.id, org_id),
            do: {:ok, org_id, role},
            else: {:error, :forbidden}
      end
    end
  end

  # A leader may invite a `participant` (full management) or scan-only `staff`,
  # never another `leader`. Defaults to `participant` when the caller omits role.
  defp member_role(attrs) do
    case get_field(attrs, "role") do
      nil -> {:ok, "participant"}
      role when role in ["participant", "staff"] -> {:ok, role}
      _ -> {:error, :invalid_role}
    end
  end

  defp assert_email_not_already_member(email, organization_id) do
    exists =
      Repo.exists?(
        from m in Membership,
          join: u in Backend.Accounts.User,
          on: u.id == m.user_id,
          where: u.email == ^email and m.organization_id == ^organization_id
      )

    if exists, do: {:error, :already_member}, else: :ok
  end

  defp assert_no_active_pending(email) do
    now = DateTime.utc_now()

    exists =
      Repo.exists?(
        from i in Invitation,
          where: i.email == ^email and i.status == "pending" and i.expires_at > ^now
      )

    if exists, do: {:error, :already_invited}, else: :ok
  end

  defp insert_invitation(inviter, email, organization_id, role) do
    token = generate_token()
    expires_at = DateTime.add(DateTime.utc_now(), @token_ttl_hours * 3600, :second)

    attrs = %{
      "inviter_id" => inviter.id,
      "organization_id" => organization_id,
      "role" => role,
      "email" => email,
      "token" => token,
      "expires_at" => expires_at
    }

    case attrs |> Invitation.changeset() |> Repo.insert() do
      {:ok, invitation} ->
        Mailer.send_invitation(email, inviter.email, token)
        {:ok, invitation}

      {:error, _} = err ->
        err
    end
  end

  @doc """
  Returns invitations relevant to `user`, newest first.

    * Admin: invitations they themselves sent.
    * Leader: every invitation issued for any org they lead, regardless of
      which leader sent it.
    * Anyone else: invitations they personally sent (typically empty).
  """
  def list_invitations(%{role: "admin"} = user) do
    Repo.all(
      from i in Invitation,
        where: i.inviter_id == ^user.id,
        order_by: [desc: i.inserted_at]
    )
  end

  def list_invitations(user) do
    led_org_ids = Organizations.list_led_by(user.id) |> Enum.map(& &1.id)

    Repo.all(
      from i in Invitation,
        where: i.inviter_id == ^user.id or i.organization_id in ^led_org_ids,
        order_by: [desc: i.inserted_at]
    )
  end

  @doc """
  Accepts an invitation by its `token`.

  Returns `{:ok, %{token: session_token, user: user}}` on success or
  `{:error, :invalid_token | :expired | :already_accepted}`.
  """
  def accept_invitation(token) when is_binary(token) do
    case Repo.get_by(Invitation, token: token) do
      nil -> {:error, :invalid_token}
      %Invitation{status: "accepted"} -> {:error, :already_accepted}
      %Invitation{status: "expired"} -> {:error, :expired}
      %Invitation{} = invitation -> consume_if_active(invitation)
    end
  end

  def accept_invitation(_), do: {:error, :invalid_token}

  defp consume_if_active(%Invitation{expires_at: expires_at} = invitation) do
    if DateTime.compare(expires_at, DateTime.utc_now()) == :gt do
      Accounts.accept_invitation(invitation)
    else
      {:error, :expired}
    end
  end

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end

  defp normalize_email(nil), do: nil
  defp normalize_email(email), do: email |> String.trim() |> String.downcase()

  defp validate_email(nil), do: {:error, :email_required}
  defp validate_email(""), do: {:error, :email_required}
  defp validate_email(email), do: {:ok, email}

  defp get_field(attrs, key) when is_map(attrs) do
    Map.get(attrs, key) || Map.get(attrs, String.to_atom(key))
  end

  defp trim_or_nil(nil), do: nil

  defp trim_or_nil(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  # Builds the placeholder org name used when an admin invites without
  # specifying one. Falls back to "Organization" if the email lacks a local
  # part (defensive — `validate_email/1` already requires non-empty input).
  defp default_org_name(email) do
    local =
      case String.split(email, "@", parts: 2) do
        [local, _domain] -> local
        _ -> ""
      end

    case String.trim(local) do
      "" -> "Organization"
      name -> "#{name}'s Org"
    end
  end
end
