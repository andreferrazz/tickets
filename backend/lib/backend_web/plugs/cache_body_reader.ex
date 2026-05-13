defmodule BackendWeb.CacheBodyReader do
  @moduledoc """
  Stores the raw request body in `conn.private[:raw_body]` before the JSON
  parser consumes it. Required for HMAC validation on the webhook endpoint.
  """

  def read_body(conn, opts) do
    {:ok, body, conn} = Plug.Conn.read_body(conn, opts)
    conn = Plug.Conn.put_private(conn, :raw_body, body)
    {:ok, body, conn}
  end
end
