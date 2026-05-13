defmodule BackendWeb.UserController do
  use BackendWeb, :controller

  @doc "GET /api/v1/me"
  def me(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      id: user.id,
      email: user.email,
      role: user.role,
      invited_by: user.invited_by,
      created_at: user.inserted_at
    })
  end
end
