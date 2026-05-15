defmodule Mix.Tasks.Abacate.SimulateWebhook do
  @moduledoc """
  Sends a signed Abacate Pay webhook to the local server. Dev helper only.

  Mirrors Abacate Pay's two-layer auth:

    1. URL secret as `?webhookSecret=...`, compared against
       `:abacate_pay_webhook_secret` on the server.
    2. HMAC-SHA256 of the body using Abacate Pay's fixed public key,
       sent in the `x-webhook-signature` header as base64.

  ## Usage

      mix abacate.simulate_webhook --checkout-id bill_test_123
      mix abacate.simulate_webhook --event checkout.refunded --checkout-id bill_test_123
      mix abacate.simulate_webhook --checkout-id bill_test_123 --url http://localhost:4000

  ## Options

    * `--checkout-id` (required) — the `abacate_checkout_id` to target.
    * `--event` — event name, defaults to `checkout.completed`.
    * `--url` — base URL, defaults to `http://localhost:4000`.
    * `--webhook-secret` — URL secret. Defaults to `$ABACATE_PAY_WEBHOOK_SECRET`
      or `"dev-secret"` to match `config/dev.exs`.
  """

  use Mix.Task

  alias Backend.AbacatePay

  @shortdoc "Send a signed Abacate Pay webhook to the local server"

  @switches [checkout_id: :string, event: :string, url: :string, webhook_secret: :string]
  @path "/webhooks/abacate-pay"

  @impl Mix.Task
  def run(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: @switches)

    checkout_id = opts[:checkout_id] || Mix.raise("--checkout-id is required")
    event = opts[:event] || "checkout.completed"
    base_url = opts[:url] || "http://localhost:4000"

    webhook_secret =
      opts[:webhook_secret] || System.get_env("ABACATE_PAY_WEBHOOK_SECRET") || "dev-secret"

    body = Jason.encode!(%{event: event, data: %{id: checkout_id}})
    signature = :crypto.mac(:hmac, :sha256, AbacatePay.public_key(), body) |> Base.encode64()
    url = "#{base_url}#{@path}?webhookSecret=#{URI.encode_www_form(webhook_secret)}"

    {:ok, _} = Application.ensure_all_started(:req)

    Mix.shell().info("POST #{url}")
    Mix.shell().info("  event: #{event}")
    Mix.shell().info("  checkout_id: #{checkout_id}")

    response =
      Req.post!(
        url,
        body: body,
        headers: [
          {"content-type", "application/json"},
          {"x-webhook-signature", signature}
        ]
      )

    Mix.shell().info("\n#{response.status} #{inspect(response.body)}")
  end
end
