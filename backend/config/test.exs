import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :backend, Backend.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "backend_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :backend, BackendWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "PkffF/amRE+8vs1MHw64knnAbF5ihnPhqUS9tRSRJi0Xvy4xuaLTWEjpcBj2rI3T",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

config :backend, Backend.Mailer, adapter: Swoosh.Adapters.Test
config :backend, :mail_from, "test@tickets.dev"
config :backend, :frontend_url, "http://localhost:5173"
config :backend, :corsica_origins, "*"
config :swoosh, :api_client, Swoosh.ApiClient.Finch

config :backend, :abacate_pay_module, Backend.AbacatePayMock
config :backend, :abacate_pay_api_key, "test-key"
config :backend, :abacate_pay_webhook_secret, "test-webhook-secret"

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
