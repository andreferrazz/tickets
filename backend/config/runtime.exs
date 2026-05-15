import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/backend start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :backend, BackendWeb.Endpoint, server: true
end

config :backend, BackendWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

get_required_env = fn key ->
  System.get_env(key) || raise "environment variable #{key} is missing."
end

config :backend, :abacate_pay_api_key, get_required_env.("ABACATE_PAY_API_KEY")
config :backend, :abacate_pay_webhook_secret, get_required_env.("ABACATE_PAY_WEBHOOK_SECRET")

if config_env() == :prod do
  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead. You can generate one by calling: mix phx.gen.secret
  secret_key_base = get_required_env.("SECRET_KEY_BASE")
  database_url = get_required_env.("DATABASE_URL")
  smtp_host = get_required_env.("SMTP_HOST")
  smtp_port = String.to_integer(get_required_env.("SMTP_PORT"))
  smtp_user = get_required_env.("SMTP_USER")
  smtp_pass = get_required_env.("SMTP_PASS")
  mail_from = get_required_env.("MAIL_FROM")
  frontend_url = get_required_env.("FRONTEND_URL")

  config :backend, :frontend_url, frontend_url
  config :backend, :corsica_origins, frontend_url
  config :backend, :mail_from, mail_from

  config :backend, Backend.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: if(System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: [])

  config :backend, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # Mailer
  config :backend, Backend.Mailer,
    adapter: Swoosh.Adapters.SMTP,
    relay: smtp_host,
    port: smtp_port,
    username: smtp_user,
    password: smtp_pass,
    ssl: false,
    tls: :always,
    tls_options: [verify: :verify_none],
    auth: :always

  config :swoosh, :api_client, Swoosh.ApiClient.Finch

  config :backend, BackendWeb.Endpoint,
    url: [
      host: System.get_env("PHX_HOST") || "example.com",
      port: 443,
      scheme: "https"
    ],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://hexdocs.pm/bandit/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :backend, BackendWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :backend, BackendWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end
