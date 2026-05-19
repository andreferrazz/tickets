defmodule Backend.OrdersTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders}
  alias Backend.Events.TicketBatch

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp make_creator do
    email = "creator_#{:rand.uniform(999_999)}@orders.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    user = Repo.get!(Accounts.User, user.id)
    {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Backend.Organizations.add_member(org.id, user.id, "leader")
    user
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@orders.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp published_event_with_tickets(creator, opts \\ []) do
    price = Keyword.get(opts, :price_cents, 5000)
    qty = Keyword.get(opts, :quantity_total, 10)

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Order Fest",
        "starts_at" => "2027-03-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} =
      Events.create_ticket_type(creator, event.id, %{"name" => "General"})

    {:ok, batch} =
      Events.create_batch(creator, tt.id, %{
        "price_cents" => price,
        "quantity_total" => qty
      })

    {event, tt, batch}
  end

  defp reload_batch(id), do: Repo.get!(TicketBatch, id)

  # ---------------------------------------------------------------------------
  # create_order/3
  # ---------------------------------------------------------------------------

  describe "create_order/3" do
    test "creates order, reserves stock from the active batch, returns payment URL" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch} = published_event_with_tickets(creator)

      assert {:ok, order} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
               ])

      assert order.status == "pending"
      assert order.total_cents == 10_000
      assert is_binary(order.abacate_checkout_id)
      assert is_binary(order.abacate_payment_url)
      assert length(order.items) == 1

      # Stock is tracked on the batch, not the ticket type
      assert reload_batch(batch.id).quantity_sold == 2

      # OrderItem snapshots the batch's id and price
      [item] = order.items
      assert item.batch_id == batch.id
      assert item.item_id == tt.id
      assert item.unit_price_cents == batch.price_cents
    end

    test "returns out_of_stock when active batch lacks capacity" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch} = published_event_with_tickets(creator)

      assert {:error, {:out_of_stock, "General"}} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 999}
               ])

      # No stock should be reserved
      assert reload_batch(batch.id).quantity_sold == 0
    end

    test "returns event_not_found for unknown event" do
      buyer = make_buyer()

      assert {:error, :event_not_found} =
               Orders.create_order(buyer, Ecto.UUID.generate(), [
                 %{"item_type" => "ticket", "item_id" => Ecto.UUID.generate(), "quantity" => 1}
               ])
    end

    test "returns event_not_available for draft event" do
      creator = make_creator()
      buyer = make_buyer()

      {:ok, event} =
        Events.create_event(creator, %{
          "title" => "Draft",
          "starts_at" => "2027-01-01T00:00:00Z"
        })

      assert {:error, :event_not_available} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => Ecto.UUID.generate(), "quantity" => 1}
               ])
    end

    test "returns no_items for empty cart" do
      creator = make_creator()
      buyer = make_buyer()
      {event, _tt, _batch} = published_event_with_tickets(creator)

      assert {:error, :no_items} = Orders.create_order(buyer, event.id, [])
    end

    test "returns ticket_required when cart has only extra items" do
      creator = make_creator()
      buyer = make_buyer()
      {event, _tt, _batch} = published_event_with_tickets(creator)

      {:ok, section} =
        Events.create_section(creator, event.id, %{"title" => "Add-ons"})

      {:ok, extra} =
        Events.create_extra(creator, event.id, %{
          "name" => "T-Shirt",
          "price_cents" => 4000,
          "section_id" => section.id
        })

      assert {:error, :ticket_required} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "extra", "item_id" => extra.id, "quantity" => 1}
               ])

      # No stock should be reserved on the extra item
      assert Repo.get!(Backend.Events.ExtraItem, extra.id).quantity_sold == 0
    end

    test "returns missing_abacate_product when batch has no upstream product id" do
      creator = make_creator()
      buyer = make_buyer()

      {:ok, event} =
        Events.create_event(creator, %{
          "title" => "Legacy",
          "starts_at" => "2027-04-01T18:00:00Z",
          "status" => "published"
        })

      {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "Legacy GA"})

      # Bypass Events.create_batch/3 to simulate a legacy row that never had an
      # Abacate Pay product created for it (e.g. backfilled from a ticket_type
      # that itself never had one).
      Repo.insert!(%TicketBatch{
        ticket_type_id: tt.id,
        sequence: 1,
        price_cents: 3000,
        quantity_total: 5,
        abacate_product_id: nil
      })

      assert {:error, {:missing_abacate_product, "Legacy GA"}} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
               ])
    end
  end

  # ---------------------------------------------------------------------------
  # list_orders/1 and get_order/2
  # ---------------------------------------------------------------------------

  describe "list_orders/1" do
    test "returns only the user's orders with event_title and items" do
      creator = make_creator()
      buyer = make_buyer()
      other = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator)

      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
      ])

      orders = Orders.list_orders(buyer)
      assert length(orders) == 1
      [order] = orders
      assert order.event_title == "Order Fest"
      assert length(order.items) == 1

      # Other user has no orders
      assert [] = Orders.list_orders(other)
    end
  end

  describe "get_order/2" do
    test "returns the order with items" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator)

      {:ok, created} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      assert {:ok, found} = Orders.get_order(buyer, created.id)
      assert found.id == created.id
      assert found.event_title == "Order Fest"
    end

    test "returns not_found for another user's order" do
      creator = make_creator()
      buyer = make_buyer()
      other = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      assert {:error, :not_found} = Orders.get_order(other, order.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Webhook callbacks
  # ---------------------------------------------------------------------------

  describe "mark_paid_by_checkout/1" do
    test "marks the order as paid" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      assert {:ok, updated} = Orders.mark_paid_by_checkout(order.abacate_checkout_id)
      assert updated.status == "paid"
      assert not is_nil(updated.paid_at)
    end

    test "returns not_found for unknown checkout id" do
      assert {:error, :not_found} = Orders.mark_paid_by_checkout("bill_unknown")
    end
  end

  # ---------------------------------------------------------------------------
  # Expiry
  # ---------------------------------------------------------------------------

  describe "list_stale_pending_orders/1 + mark_expired/1" do
    test "lists pending orders past the cutoff and expires them with stock release" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch} = published_event_with_tickets(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 3}
        ])

      # Backdate so the order falls outside the cutoff window.
      Repo.update_all(
        from(o in Backend.Orders.Order, where: o.id == ^order.id),
        set: [inserted_at: ~U[2020-01-01 00:00:00Z]]
      )

      assert [stale] = Orders.list_stale_pending_orders(30)
      assert stale.id == order.id

      assert {:ok, expired} = Orders.mark_expired(stale)
      assert expired.status == "expired"
      assert Repo.get!(Backend.Orders.Order, order.id).status == "expired"
      assert reload_batch(batch.id).quantity_sold == 0
    end

    test "ignores fresh pending orders" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator)

      {:ok, _order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      assert Orders.list_stale_pending_orders(30) == []
    end
  end

  # ---------------------------------------------------------------------------
  # Batches: auto-close on sellout, advance, manual close, refund-reopen
  # ---------------------------------------------------------------------------

  describe "batch resolution" do
    test "auto-closes the active batch on sellout and advances to the next" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch1} = published_event_with_tickets(creator, quantity_total: 2)

      {:ok, batch2} =
        Events.create_batch(creator, tt.id, %{
          "price_cents" => 7000,
          "quantity_total" => 5
        })

      # Buy all 2 from batch1 — should fill it and mark it closed.
      assert {:ok, _} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
               ])

      closed = reload_batch(batch1.id)
      assert closed.quantity_sold == 2
      refute is_nil(closed.closed_at)
      assert closed.auto_closed

      # Next reservation should pull from batch2 at its own price.
      assert {:ok, order2} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
               ])

      [item] = order2.items
      assert item.batch_id == batch2.id
      assert item.unit_price_cents == 7000
      assert reload_batch(batch2.id).quantity_sold == 1
    end

    test "returns out_of_stock once every batch is closed" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator, quantity_total: 1)

      # Sell the only batch out.
      {:ok, _} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      assert {:error, {:out_of_stock, "General"}} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
               ])
    end

    test "manually closing the active batch advances to the next on the next sale" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch1} = published_event_with_tickets(creator, quantity_total: 10)

      {:ok, batch2} =
        Events.create_batch(creator, tt.id, %{
          "price_cents" => 9000,
          "quantity_total" => 5
        })

      {:ok, _} = Events.close_batch(creator, batch1.id)

      assert {:ok, order} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
               ])

      [item] = order.items
      assert item.batch_id == batch2.id
    end

    test "refunding an auto-closed batch reopens it for further sales" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch} = published_event_with_tickets(creator, quantity_total: 1)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      # Sanity: auto-closed
      assert reload_batch(batch.id).auto_closed

      {:ok, _} = Orders.mark_refunded_by_checkout(order.abacate_checkout_id)

      reopened = reload_batch(batch.id)
      assert is_nil(reopened.closed_at)
      refute reopened.auto_closed
      assert reopened.quantity_sold == 0
    end

    test "free order skips Abacate checkout and is paid + fulfilled immediately" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator, price_cents: 0)

      assert {:ok, order} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
               ])

      assert order.status == "paid"
      assert order.total_cents == 0
      assert is_nil(order.abacate_checkout_id)
      assert is_nil(order.abacate_payment_url)
      refute is_nil(order.paid_at)

      # Passes are issued inline (no webhook needed for free orders).
      assert Repo.aggregate(
               from(p in Backend.Tickets.Pass, where: p.order_id == ^order.id),
               :count
             ) == 2
    end

    test "mixed cart with a free ticket and a paid extra builds a checkout for the extra only" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, _batch} = published_event_with_tickets(creator, price_cents: 0)

      {:ok, section} = Events.create_section(creator, event.id, %{"title" => "Add-ons"})

      {:ok, extra} =
        Events.create_extra(creator, event.id, %{
          "name" => "Drink",
          "price_cents" => 1500,
          "section_id" => section.id
        })

      assert {:ok, order} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1},
                 %{"item_type" => "extra", "item_id" => extra.id, "quantity" => 1}
               ])

      # Order goes through normal checkout — total > 0 because of the extra.
      assert order.status == "pending"
      assert order.total_cents == 1500
      assert is_binary(order.abacate_payment_url)
    end

    test "refunding a sale from a manually-closed batch keeps it closed" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt, batch} = published_event_with_tickets(creator, quantity_total: 10)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      # Creator manually closes the batch despite remaining capacity.
      {:ok, _} = Events.close_batch(creator, batch.id)

      # Refund frees the 2 reserved seats — but creator's close is sticky.
      {:ok, _} = Orders.mark_refunded_by_checkout(order.abacate_checkout_id)

      after_refund = reload_batch(batch.id)
      refute is_nil(after_refund.closed_at)
      refute after_refund.auto_closed
      assert after_refund.quantity_sold == 0
    end
  end
end
