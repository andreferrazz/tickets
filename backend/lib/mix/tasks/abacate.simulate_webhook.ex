defmodule Mix.Tasks.Abacate.SimulateWebhook do
  @moduledoc """
  Sends a signed Abacate Pay webhook to the local server. Dev helper only.

  ## Usage

      mix abacate.simulate_webhook --checkout-id bill_test_123
      mix abacate.simulate_webhook --event checkout.refunded --checkout-id bill_test_123
      mix abacate.simulate_webhook --checkout-id bill_test_123 --url http://localhost:4000

  ## Options

    * `--checkout-id` (required) — the `abacate_checkout_id` to target.
    * `--event` — event name, defaults to `checkout.completed`.
    * `--url` — base URL, defaults to `http://localhost:4000`.
    * `--secret` — HMAC secret. Defaults to `$ABACATE_PAY_WEBHOOK_SECRET`
      or `"dev-secret"` to match `config/dev.exs`.
  """

  use Mix.Task

  @shortdoc "Send a signed Abacate Pay webhook to the local server"

  @switches [checkout_id: :string, event: :string, url: :string, secret: :string]
  @path "/webhooks/abacate-pay"

  @impl Mix.Task
  def run(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: @switches)

    checkout_id = opts[:checkout_id] || Mix.raise("--checkout-id is required")
    event = opts[:event] || "checkout.completed"
    base_url = opts[:url] || "http://localhost:4000"
    secret = opts[:secret] || System.get_env("ABACATE_PAY_WEBHOOK_SECRET") || "dev-secret"

    body = Jason.encode!(%{event: event, data: %{id: checkout_id}})
    signature = :crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)

    {:ok, _} = Application.ensure_all_started(:req)

    Mix.shell().info("POST #{base_url}#{@path}")
    Mix.shell().info("  event: #{event}")
    Mix.shell().info("  checkout_id: #{checkout_id}")

    response =
      Req.post!(
        "#{base_url}#{@path}",
        body: body,
        headers: [
          {"content-type", "application/json"},
          {"x-abacatepay-hmac-sha256", signature}
        ]
      )

    Mix.shell().info("\n#{response.status} #{inspect(response.body)}")
  end
end
