defmodule BackendWeb.RequireCreatorPlug do
  @moduledoc "Halts with 403 unless the current user has the creator or admin role."

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{role: role} when role in ["creator", "admin"] ->
        conn

      _ ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "creator role required"})
        |> halt()
    end
  end
end
