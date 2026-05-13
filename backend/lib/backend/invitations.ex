defmodule Backend.Invitations do
  @moduledoc """
  Creator invitation management.

  A creator or admin invites a buyer by email. The invitation email contains a
  unique tokenized link valid for 24 hours. Opening the link calls
  `accept_invitation/1`, which creates the user (if new) or promotes an
  existing buyer to `creator`, marks the invitation as accepted, and issues a
  session token.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Invitations.Invitation
  alias Backend.Mailer
  alias Backend.Accounts

  @token_ttl_hours 24

  @doc """
  Creates a pending invitation from `inviter` to `email` and sends the email.

  Returns `{:error, :already_invited}` if an unexpired pending invitation
  already exists for that address.
  """
  def create_invitation(inviter, email) do
    email = String.downcase(String.trim(email))

    if has_active_pending_invitation?(email) do
      {:error, :already_invited}
    else
      token = generate_token()
      expires_at = DateTime.add(DateTime.utc_now(), @token_ttl_hours * 3600, :second)

      attrs = %{
        "inviter_id" => inviter.id,
        "email" => email,
        "token" => token,
        "expires_at" => expires_at
      }

      attrs
      |> Invitation.changeset()
      |> Repo.insert()
      |> case do
        {:ok, invitation} ->
          Mailer.send_invitation(email, inviter.email, token)
          {:ok, invitation}

        {:error, _} = err ->
          err
      end
    end
  end

  @doc "Returns all invitations sent by `inviter`, newest first."
  def list_invitations(inviter) do
    Repo.all(
      from i in Invitation,
        where: i.inviter_id == ^inviter.id,
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

  defp has_active_pending_invitation?(email) do
    now = DateTime.utc_now()

    Repo.exists?(
      from i in Invitation,
        where: i.email == ^email and i.status == "pending" and i.expires_at > ^now
    )
  end

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
