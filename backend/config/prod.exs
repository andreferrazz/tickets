import Config

# Force using SSL in production. This also sets the "strict-security-transport" header,
# known as HSTS. If you have a health check endpoint, you may want to exclude it below.
# Note `:force_ssl` is required to be set at compile-time.
config :backend, BackendWeb.Endpoint,
  force_ssl: [
    rewrite_on: [:x_forwarded_proto],
    exclude: [
      # paths: ["/health"],
      hosts: ["localhost", "127.0.0.1"]
    ]
  ]

# Do not print debug messages in production
config :logger, level: :info

# FRONTEND_URL must be set at build time for CORS in prod (used by compile_env).
# Pass as a Docker build-arg: --build-arg FRONTEND_URL=https://yourapp.com
config :backend, :corsica_origins, System.get_env("FRONTEND_URL", "*")

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.
