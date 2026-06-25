defmodule BackendWeb.MembershipController do
  use BackendWeb, :controller

  alias Backend.Organizations

  @doc """
  GET /api/v1/organizations/:id/members

  Lists the org's members (`user_id`, `email`, `role`) for the team-management
  UI. Manager-only — leaders and participants (admins bypass); anyone else gets
  `403`.
  """
  def index(conn, %{"id" => org_id}) do
    case authorize_manager(conn.assigns.current_user, org_id) do
      :ok -> json(conn, Organizations.list_members(org_id))
      {:error, :forbidden} -> forbidden(conn)
    end
  end

  @doc """
  PATCH /api/v1/organizations/:id/members/:user_id

  Body `{"role": "participant" | "staff"}`. Changes a member's role between
  participant and scan-only staff. Manager-only — leaders and participants
  (admins bypass). Returns `403` when the caller is not a manager, the target is
  the leader, or the role is invalid; `404` when the user is not a member.
  """
  def update(conn, %{"id" => org_id, "user_id" => user_id, "role" => role}) do
    with :ok <- authorize_manager(conn.assigns.current_user, org_id),
         {:ok, _membership} <- Organizations.set_member_role(org_id, user_id, role) do
      json(conn, %{user_id: user_id, role: role})
    else
      {:error, :forbidden} -> forbidden(conn)
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "member not found"})
    end
  end

  def update(conn, _), do: conn |> put_status(:bad_request) |> json(%{error: "role required"})

  @doc """
  DELETE /api/v1/organizations/:id/members/:user_id

  Removes a member. Manager-only — leaders and participants (admins bypass).
  Returns `403` when the caller is not a manager, removes themselves, or targets
  the leader; `404` when the user is not a member; `204` on success.
  """
  def delete(conn, %{"id" => org_id, "user_id" => user_id}) do
    current = conn.assigns.current_user

    with :ok <- authorize_manager(current, org_id),
         :ok <- refuse_self(current, user_id),
         {:ok, _membership} <- Organizations.remove_member(org_id, user_id) do
      send_resp(conn, :no_content, "")
    else
      {:error, :forbidden} -> forbidden(conn)
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "member not found"})
    end
  end

  defp authorize_manager(%{role: "admin"}, _org_id), do: :ok

  defp authorize_manager(user, org_id) do
    if Organizations.can_manage?(user.id, org_id), do: :ok, else: {:error, :forbidden}
  end

  # Managers may remove others but not themselves; admins are never members so
  # this never matches for them.
  defp refuse_self(%{id: id}, user_id) when id == user_id, do: {:error, :forbidden}
  defp refuse_self(_user, _user_id), do: :ok

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
end
