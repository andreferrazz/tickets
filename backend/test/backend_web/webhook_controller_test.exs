defmodule BackendWeb.WebhookControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.AbacatePay
  alias Backend.Repo
  alias Backend.Webhooks.Event

  @path "/webhooks/abacate-pay"

  defp configured_secret, do: Application.fetch_env!(:backend, :abacate_pay_webhook_secret)

  defp sign(body),
    do: :crypto.mac(:hmac, :sha256, AbacatePay.public_key(), body) |> Base.encode64()

  defp post_webhook(conn, body, opts \\ []) do
    secret = Keyword.get(opts, :secret, configured_secret())
    signature = Keyword.get(opts, :signature, sign(body))

    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("x-webhook-signature", signature)
    |> post("#{@path}?webhookSecret=#{secret}", body)
  end

  describe "POST /webhooks/abacate-pay" do
    test "logs the event when signature and URL secret are valid", %{conn: conn} do
      body = Jason.encode!(%{event: "checkout.completed", data: %{id: "bill_unknown"}})

      conn = post_webhook(conn, body)

      # 404 is fine here — the order doesn't exist, but the webhook should still be logged
      assert conn.status in [200, 404]

      events = Repo.all(Event)
      assert length(events) == 1
      [event] = events
      assert event.event_type == "checkout.completed"
      assert event.payload["event"] == "checkout.completed"
      assert event.payload["data"]["id"] == "bill_unknown"
    end

    test "logs events with unknown shape (event_type may be nil)", %{conn: conn} do
      body = Jason.encode!(%{foo: "bar"})

      conn = post_webhook(conn, body)

      assert conn.status == 200
      [event] = Repo.all(Event)
      assert event.event_type == nil
      assert event.payload["foo"] == "bar"
    end

    test "rejects when URL secret is wrong and does not log", %{conn: conn} do
      body = Jason.encode!(%{event: "checkout.completed", data: %{id: "bill_x"}})

      conn = post_webhook(conn, body, secret: "wrong")

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
      assert Repo.all(Event) == []
    end

    test "rejects when HMAC signature is wrong and does not log", %{conn: conn} do
      body = Jason.encode!(%{event: "checkout.completed", data: %{id: "bill_x"}})

      conn = post_webhook(conn, body, signature: "deadbeef")

      assert json_response(conn, 401) == %{"error" => "invalid signature"}
      assert Repo.all(Event) == []
    end
  end
end
