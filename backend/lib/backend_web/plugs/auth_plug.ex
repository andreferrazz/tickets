defmodule BackendWeb.AuthPlug do
  @moduledoc "Extracts Bearer token and assigns current_user, halts with 401 if missing/invalid."

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         %Backend.Accounts.User{} = user <- Backend.Accounts.get_user_by_token(token) do
      assign(conn, :current_user, user)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "unauthorized"})
        |> halt()
    end
  end
end
