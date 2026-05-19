defmodule BackendWeb.InvitationController do
  use BackendWeb, :controller

  alias Backend.Invitations

  @doc """
  POST /api/v1/invitations

  Admin: body `{ "email": "...", "organization_name": "..." }` — creates a
  brand new org and a leader invitation.

  Leader: body `{ "email": "...", "organization_id": "..." }` — invites a
  participant to their org. `organization_id` is optional when the leader
  belongs to only one org.
  """
  def create(conn, %{"email" => _} = params) do
    case Invitations.create_invitation(conn.assigns.current_user, params) do
      {:ok, invitation} ->
        conn |> put_status(:created) |> json(invitation_json(invitation))

      {:error, :already_invited} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "a pending invitation already exists for this email"})

      {:error, :already_member} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "user is already a member of this organization"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, :organization_name_required} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "organization_name required"})

      {:error, :organization_id_required} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "organization_id required"})

      {:error, :email_required} ->
        conn |> put_status(:bad_request) |> json(%{error: "email required"})

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

  @doc "POST /api/v1/invitations/accept — public; consumes a tokenized link"
  def accept(conn, %{"token" => token}) do
    case Invitations.accept_invitation(token) do
      {:ok, %{token: session_token, user: user}} ->
        json(conn, %{token: session_token, user: BackendWeb.UserController.user_json(user)})

      {:error, reason} when reason in [:invalid_token, :expired, :already_accepted] ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: Atom.to_string(reason)})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: inspect(reason)})
    end
  end

  def accept(conn, _), do: conn |> put_status(:bad_request) |> json(%{error: "token required"})

  # ---------------------------------------------------------------------------

  defp invitation_json(inv) do
    %{
      id: inv.id,
      inviter_id: inv.inviter_id,
      organization_id: inv.organization_id,
      role: inv.role,
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
