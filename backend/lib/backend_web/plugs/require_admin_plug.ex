defmodule BackendWeb.RequireAdminPlug do
  @moduledoc "Halts with 403 unless the current user has the admin role."

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{role: "admin"} ->
        conn

      _ ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "admin role required"})
        |> halt()
    end
  end
end
