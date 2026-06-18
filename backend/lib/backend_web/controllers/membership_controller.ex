defmodule BackendWeb.MembershipController do
  use BackendWeb, :controller

  alias Backend.Organizations

  @doc """
  GET /api/v1/organizations/:id/members

  Lists the org's members (`user_id`, `email`, `role`) for the leader's
  team-management UI. Leader-only (admins bypass); anyone else gets `403`.
  """
  def index(conn, %{"id" => org_id}) do
    case authorize_leader(conn.assigns.current_user, org_id) do
      :ok -> json(conn, Organizations.list_members(org_id))
      {:error, :forbidden} -> forbidden(conn)
    end
  end

  @doc """
  PATCH /api/v1/organizations/:id/members/:user_id

  Body `{"role": "participant" | "staff"}`. Changes a member's role between
  participant and scan-only staff. Leader-only (admins bypass). Returns `403`
  when the caller is not the leader, the target is the leader, or the role is
  invalid; `404` when the user is not a member.
  """
  def update(conn, %{"id" => org_id, "user_id" => user_id, "role" => role}) do
    with :ok <- authorize_leader(conn.assigns.current_user, org_id),
         {:ok, _membership} <- Organizations.set_member_role(org_id, user_id, role) do
      json(conn, %{user_id: user_id, role: role})
    else
      {:error, :forbidden} -> forbidden(conn)
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "member not found"})
    end
  end

  def update(conn, _), do: conn |> put_status(:bad_request) |> json(%{error: "role required"})

  defp authorize_leader(%{role: "admin"}, _org_id), do: :ok

  defp authorize_leader(user, org_id) do
    if Organizations.leader?(user.id, org_id), do: :ok, else: {:error, :forbidden}
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
end
