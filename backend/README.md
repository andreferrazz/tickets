# Backend

To start your Phoenix server:

* Run `mix setup` to install and setup dependencies
* Start Phoenix endpoint with `mix phx.server` or inside IEx with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser.

Ready to run in production? Please [check our deployment guides](https://hexdocs.pm/phoenix/deployment.html).

## Simulating Abacate Pay webhooks locally

The `abacate.simulate_webhook` Mix task sends a signed webhook to your running
dev server, which is useful for exercising the payment flow without going
through Abacate Pay sandbox UI.

Prerequisites: the Phoenix server must be running (`mix phx.server`) and the
target order must already exist in the dev DB with an `abacate_checkout_id`.

### Usage

```bash
# Minimum: defaults to event=checkout.completed and url=http://localhost:4000
mix abacate.simulate_webhook --checkout-id bill_test_123

# Simulate a refund
mix abacate.simulate_webhook --event checkout.refunded --checkout-id bill_test_123

# Point at a different host/port
mix abacate.simulate_webhook --checkout-id bill_test_123 --url http://localhost:4001
```

### Options

| Flag | Required | Default | Purpose |
|---|---|---|---|
| `--checkout-id` | yes | — | The `abacate_checkout_id` of an order to target |
| `--event` | no | `checkout.completed` | Webhook event name |
| `--url` | no | `http://localhost:4000` | Base URL of the local server |
| `--secret` | no | `$ABACATE_PAY_WEBHOOK_SECRET` or `"dev-secret"` | HMAC secret used to sign the body |

The secret default (`"dev-secret"`) matches the fallback in `config/dev.exs`,
so the task works out of the box when no env var is set.

### Troubleshooting

* `401`/`403` response: the HMAC didn't verify — the `--secret` value doesn't
  match `config :backend, :abacate_pay_webhook_secret` on the running server.
* `404` or order-not-found errors: the `--checkout-id` doesn't correspond to
  any order in the dev DB.

## Learn more

* Official website: https://www.phoenixframework.org/
* Guides: https://hexdocs.pm/phoenix/overview.html
* Docs: https://hexdocs.pm/phoenix
* Forum: https://elixirforum.com/c/phoenix-forum
* Source: https://github.com/phoenixframework/phoenix
