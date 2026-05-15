defmodule BackendWeb.RuntimeCors do
  @moduledoc "Wraps Corsica so the allowed origins are read at runtime."

  @behaviour Plug

  @impl true
  def init(_opts), do: []

  @impl true
  def call(conn, _opts) do
    origins = Application.fetch_env!(:backend, :corsica_origins)

    opts =
      Corsica.init(
        origins: origins,
        allow_headers: ["content-type", "authorization"],
        allow_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_credentials: false
      )

    Corsica.call(conn, opts)
  end
end
