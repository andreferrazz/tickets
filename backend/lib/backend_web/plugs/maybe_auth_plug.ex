defmodule BackendWeb.MaybeAuthPlug do
  @moduledoc "Assigns current_user if a valid Bearer token is present; otherwise passes through."

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         %Backend.Accounts.User{} = user <- Backend.Accounts.get_user_by_token(token) do
      assign(conn, :current_user, user)
    else
      _ -> conn
    end
  end
end
