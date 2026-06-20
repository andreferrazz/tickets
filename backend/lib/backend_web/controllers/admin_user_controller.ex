defmodule BackendWeb.AdminUserController do
  use BackendWeb, :controller

  alias Backend.Accounts
  alias BackendWeb.UserController

  @doc "GET /api/v1/admin/users — every user, for the admin user-management page."
  def index(conn, _params) do
    users = Enum.map(Accounts.list_users(), &UserController.user_json/1)
    json(conn, users)
  end

  @doc """
  POST /api/v1/admin/users/:id/impersonate — issues a session token for the
  target user so an admin can build a "log in as this user" link.
  """
  def impersonate(conn, %{"id" => id}) do
    case Accounts.get_user(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "user not found"})

      user ->
        {:ok, token} = Accounts.create_session(user)
        json(conn, %{token: token})
    end
  end
end
