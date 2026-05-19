defmodule Backend.Orders.ExpiryWorkerTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders}
  alias Backend.AbacatePayMock
  alias Backend.Events.TicketBatch
  alias Backend.Orders.{ExpiryWorker, Order}
  alias Backend.Tickets.Pass

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp make_user(prefix) do
    email = "#{prefix}_#{:rand.uniform(999_999)}@worker.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp make_creator do
    user = make_user("creator")
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp published_event_with_tickets(creator, opts \\ []) do
    qty = Keyword.get(opts, :quantity_total, 10)

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Expiry Fest",
        "starts_at" => "2027-03-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "General"})

    {:ok, batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 5000, "quantity_total" => qty})

    {event, tt, batch}
  end

  defp place_pending_order(buyer, event, tt, qty) do
    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => qty}
      ])

    order
  end

  defp backdate(order_id, minutes_ago) do
    moment =
      DateTime.utc_now()
      |> DateTime.add(-minutes_ago * 60, :second)
      |> DateTime.truncate(:second)

    Repo.update_all(from(o in Order, where: o.id == ^order_id), set: [inserted_at: moment])
  end

  defp run_once, do: ExpiryWorker.handle_info(:run, %{})

  defp reload_order(id), do: Repo.get!(Order, id)
  defp reload_batch(id), do: Repo.get!(TicketBatch, id)

  # ---------------------------------------------------------------------------
  # Cases
  # ---------------------------------------------------------------------------

  describe "handle_info(:run, _)" do
    test "fulfils the order when Abacate Pay reports it as paid (webhook fallback)" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, _batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 2)
      backdate(order.id, 30)

      AbacatePayMock.put_checkout(order.abacate_checkout_id, %{
        status: "paid",
        payment_method: "PIX"
      })

      run_once()

      reloaded = reload_order(order.id)
      assert reloaded.status == "paid"
      assert reloaded.paid_at
      assert reloaded.payment_method == "PIX"
      assert Repo.aggregate(from(p in Pass, where: p.order_id == ^order.id), :count) == 2
    end

    test "expires the order and releases stock when upstream is cancelled" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 3)
      backdate(order.id, 30)

      AbacatePayMock.put_checkout(order.abacate_checkout_id, %{status: "cancelled"})

      run_once()

      assert reload_order(order.id).status == "expired"
      assert reload_batch(batch.id).quantity_sold == 0
    end

    test "expires the order when upstream is still pending (no cancel endpoint exists)" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 1)
      backdate(order.id, 30)

      # Default mock behaviour is `pending`; no override needed.
      run_once()

      assert reload_order(order.id).status == "expired"
      assert reload_batch(batch.id).quantity_sold == 0
    end

    test "leaves the order pending when Abacate Pay returns an error" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 2)
      backdate(order.id, 30)

      AbacatePayMock.put_checkout(order.abacate_checkout_id, {:error, :boom})

      run_once()

      assert reload_order(order.id).status == "pending"
      # Stock stays reserved — we don't release on upstream failures.
      assert reload_batch(batch.id).quantity_sold == 2
    end

    test "skips orders younger than the pending threshold" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 2)
      # Fresh order (no backdate). If the worker touched it, expiring would
      # release stock — assert it stays reserved.
      AbacatePayMock.put_checkout(order.abacate_checkout_id, %{status: "cancelled"})

      run_once()

      assert reload_order(order.id).status == "pending"
      assert reload_batch(batch.id).quantity_sold == 2
    end

    test "expires orders with no abacate_checkout_id without calling Abacate Pay" do
      creator = make_creator()
      buyer = make_user("buyer")
      {event, tt, batch} = published_event_with_tickets(creator)
      order = place_pending_order(buyer, event, tt, 2)
      backdate(order.id, 30)

      # Null out the checkout id to simulate an order that never got one.
      Repo.update_all(
        from(o in Order, where: o.id == ^order.id),
        set: [abacate_checkout_id: nil]
      )

      run_once()

      assert reload_order(order.id).status == "expired"
      assert reload_batch(batch.id).quantity_sold == 0
    end
  end
end
