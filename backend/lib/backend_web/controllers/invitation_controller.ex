defmodule BackendWeb.InvitationController do
  use BackendWeb, :controller

  alias Backend.Invitations

  @doc "POST /api/v1/invitations — creator only"
  def create(conn, %{"email" => email}) do
    case Invitations.create_invitation(conn.assigns.current_user, email) do
      {:ok, invitation} ->
        conn |> put_status(:created) |> json(invitation_json(invitation))

      {:error, :already_invited} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "a pending invitation already exists for this email"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  def create(conn, _), do: conn |> put_status(:bad_request) |> json(%{error: "email required"})

  @doc "GET /api/v1/invitations — creator only"
  def index(conn, _params) do
    invitations = Invitations.list_invitations(conn.assigns.current_user)
    json(conn, Enum.map(invitations, &invitation_json/1))
  end

  # ---------------------------------------------------------------------------

  defp invitation_json(inv) do
    %{
      id: inv.id,
      inviter_id: inv.inviter_id,
      email: inv.email,
      status: inv.status,
      created_at: inv.inserted_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
