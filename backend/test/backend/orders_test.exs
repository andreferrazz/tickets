defmodule Backend.OrdersTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders}
  alias Backend.Events.TicketType

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp make_creator do
    email = "creator_#{:rand.uniform(999_999)}@orders.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@orders.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp published_event_with_tickets(creator) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Order Fest",
        "starts_at" => "2027-03-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} =
      Events.create_ticket_type(creator, event.id, %{
        "name" => "General",
        "price_cents" => 5000,
        "quantity_total" => 10
      })

    {event, tt}
  end

  # ---------------------------------------------------------------------------
  # create_order/3
  # ---------------------------------------------------------------------------

  describe "create_order/3" do
    test "creates order, reserves stock, returns payment URL" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt} = published_event_with_tickets(creator)

      assert {:ok, order} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
               ])

      assert order.status == "pending"
      assert order.total_cents == 10_000
      assert is_binary(order.abacate_checkout_id)
      assert is_binary(order.abacate_payment_url)
      assert length(order.items) == 1

      # Stock should be reserved
      updated_tt = Repo.get!(TicketType, tt.id)
      assert updated_tt.quantity_sold == 2
    end

    test "returns out_of_stock when insufficient quantity" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt} = published_event_with_tickets(creator)

      assert {:error, {:out_of_stock, "General"}} =
               Orders.create_order(buyer, event.id, [
                 %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 999}
               ])

      # No stock should be reserved
      assert Repo.get!(TicketType, tt.id).quantity_sold == 0
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
      {event, _tt} = published_event_with_tickets(creator)

      assert {:error, :no_items} = Orders.create_order(buyer, event.id, [])
    end

    test "returns missing_abacate_product when ticket type has no upstream product id" do
      creator = make_creator()
      buyer = make_buyer()

      {:ok, event} =
        Events.create_event(creator, %{
          "title" => "Legacy",
          "starts_at" => "2027-04-01T18:00:00Z",
          "status" => "published"
        })

      # Bypass Events.create_ticket_type/3 to simulate a legacy row that never
      # had an Abacate Pay product created for it.
      tt =
        Repo.insert!(%TicketType{
          event_id: event.id,
          name: "Legacy GA",
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
      {event, tt} = published_event_with_tickets(creator)

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
      {event, tt} = published_event_with_tickets(creator)

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
      {event, tt} = published_event_with_tickets(creator)

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
      {event, tt} = published_event_with_tickets(creator)

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

  describe "expire_stale_orders/1" do
    test "expires old pending orders and releases stock" do
      creator = make_creator()
      buyer = make_buyer()
      {event, tt} = published_event_with_tickets(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 3}
        ])

      # Backdating the order to simulate expiry
      Repo.update_all(
        from(o in Backend.Orders.Order, where: o.id == ^order.id),
        set: [inserted_at: ~U[2020-01-01 00:00:00Z]]
      )

      count = Orders.expire_stale_orders(30)
      assert count == 1

      assert Repo.get!(Backend.Orders.Order, order.id).status == "expired"
      # Stock released
      assert Repo.get!(TicketType, tt.id).quantity_sold == 0
    end
  end
end
