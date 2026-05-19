defmodule BackendWeb.WebhookControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, AbacatePay, Events, Orders, Repo}
  alias Backend.Tickets.Pass
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

  describe "checkout.completed side effects" do
    test "issues passes and sends tickets + extras emails", %{conn: conn} do
      {buyer, order} = paid_order_with_extras(ticket_qty: 3)
      drain_mailbox()

      body =
        Jason.encode!(%{
          event: "checkout.completed",
          data: %{checkout: %{id: order.abacate_checkout_id}}
        })

      conn = post_webhook(conn, body)
      assert json_response(conn, 200) == %{"ok" => true}

      assert Repo.aggregate(from(p in Pass, where: p.order_id == ^order.id), :count) == 4

      subjects = collect_subjects_for(buyer.email)
      assert Enum.any?(subjects, &String.starts_with?(&1, "Seus ingressos"))
      assert Enum.any?(subjects, &String.starts_with?(&1, "Seus extras"))
    end

    test "persists method, installments, and platformFee from the checkout payload",
         %{conn: conn} do
      {_buyer, order} = paid_order_with_extras(ticket_qty: 1)
      drain_mailbox()

      body =
        Jason.encode!(%{
          event: "checkout.completed",
          data: %{
            checkout: %{
              id: order.abacate_checkout_id,
              installmentsCount: 3,
              platformFee: 114
            },
            payerInformation: %{method: "CARD"}
          }
        })

      conn = post_webhook(conn, body)
      assert json_response(conn, 200) == %{"ok" => true}

      reloaded = Repo.get!(Backend.Orders.Order, order.id)
      assert reloaded.payment_method == "CARD"
      assert reloaded.card_installments == 3
      assert reloaded.platform_fee_cents == 114
    end

    test "leaves payment columns nil when the webhook omits them", %{conn: conn} do
      {_buyer, order} = paid_order_with_extras(ticket_qty: 1)
      drain_mailbox()

      body =
        Jason.encode!(%{
          event: "checkout.completed",
          data: %{checkout: %{id: order.abacate_checkout_id}}
        })

      _ = post_webhook(conn, body)
      reloaded = Repo.get!(Backend.Orders.Order, order.id)
      assert reloaded.payment_method == nil
      assert reloaded.card_installments == nil
      assert reloaded.platform_fee_cents == nil
    end

    test "is idempotent: replaying the webhook does not duplicate passes or emails",
         %{conn: conn} do
      {buyer, order} = paid_order_with_extras(ticket_qty: 2)
      drain_mailbox()

      body =
        Jason.encode!(%{
          event: "checkout.completed",
          data: %{checkout: %{id: order.abacate_checkout_id}}
        })

      _ = post_webhook(conn, body)
      assert Repo.aggregate(from(p in Pass, where: p.order_id == ^order.id), :count) == 3
      drain_mailbox()

      _ = post_webhook(conn, body)
      assert Repo.aggregate(from(p in Pass, where: p.order_id == ^order.id), :count) == 3
      assert collect_subjects_for(buyer.email) == []
    end
  end

  defp drain_mailbox do
    receive do
      {:email, _} -> drain_mailbox()
    after
      0 -> :ok
    end
  end

  defp collect_subjects_for(email_addr, acc \\ []) do
    receive do
      {:email, %Swoosh.Email{} = email} ->
        if Enum.any?(email.to, fn {_, addr} -> addr == email_addr end) do
          collect_subjects_for(email_addr, [email.subject | acc])
        else
          collect_subjects_for(email_addr, acc)
        end
    after
      0 -> Enum.reverse(acc)
    end
  end

  defp paid_order_with_extras(opts) do
    ticket_qty = Keyword.fetch!(opts, :ticket_qty)

    creator_email = "creator_#{:rand.uniform(999_999)}@webhook.test"
    {:ok, code} = Accounts.request_code(creator_email)
    {:ok, %{user: creator}} = Accounts.verify_code(creator_email, code)

    Repo.update_all(from(u in Accounts.User, where: u.id == ^creator.id),
      set: [role: "creator"]
    )

    creator = Repo.get!(Accounts.User, creator.id)

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Webhook Fest",
        "starts_at" => "2027-11-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "GA"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 2000, "quantity_total" => 100})

    {:ok, section} = Events.create_section(creator, event.id, %{"title" => "Add-ons"})

    {:ok, extra} =
      Events.create_extra(creator, event.id, %{
        "name" => "Drink",
        "price_cents" => 500,
        "section_id" => section.id
      })

    buyer_email = "buyer_#{:rand.uniform(999_999)}@webhook.test"
    {:ok, code} = Accounts.request_code(buyer_email)
    {:ok, %{user: buyer}} = Accounts.verify_code(buyer_email, code)

    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => ticket_qty},
        %{"item_type" => "extra", "item_id" => extra.id, "quantity" => 1}
      ])

    {buyer, order}
  end
end
