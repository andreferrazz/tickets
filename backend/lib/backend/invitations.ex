defmodule Backend.Invitations do
  @moduledoc """
  Creator invitation management.

  A creator or admin invites a buyer by email. When that buyer next logs in,
  `Accounts.verify_code/2` promotes them to the creator role automatically.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Invitations.Invitation
  alias Backend.Mailer

  @doc """
  Creates a pending invitation from `inviter` to `email` and sends the email.

  Returns `{:error, :already_invited}` if a pending invitation already exists
  for that address.
  """
  def create_invitation(inviter, email) do
    email = String.downcase(String.trim(email))

    if has_pending_invitation?(email) do
      {:error, :already_invited}
    else
      %{"inviter_id" => inviter.id, "email" => email}
      |> Invitation.changeset()
      |> Repo.insert()
      |> case do
        {:ok, invitation} ->
          Mailer.send_invitation(email, inviter.email)
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

  defp has_pending_invitation?(email) do
    Repo.exists?(from i in Invitation, where: i.email == ^email and i.status == "pending")
  end
end
