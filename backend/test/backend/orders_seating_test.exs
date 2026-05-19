defmodule Backend.OrdersSeatingTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders, Tickets}
  alias Backend.Events.SeatAssignment

  defp make_creator do
    email = "creator_#{:rand.uniform(999_999)}@osseat.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@osseat.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  # Free batches skip Abacate Pay and inline-fulfill, which is exactly what we
  # want for these tests: it exercises both the reservation transaction and the
  # pass-with-seat issuance in one call.
  defp free_seated_event(creator) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Seated Free Fest",
        "starts_at" => "2027-04-01T18:00:00Z",
        "status" => "published",
        "seat_selection_enabled" => true,
        "seats_per_table" => 4
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "General"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 0, "quantity_total" => 20})

    {:ok, t1} = Events.create_seat_table(creator, event.id, %{"name" => "Mesa Verde"})
    {:ok, t2} = Events.create_seat_table(creator, event.id, %{"name" => "Mesa Azul"})

    %{event: event, ticket_type: tt, t1: t1, t2: t2}
  end

  describe "create_order/4 with seats" do
    test "reserves seats atomically and links passes with seat_label" do
      creator = make_creator()
      buyer = make_buyer()
      ctx = free_seated_event(creator)

      assert {:ok, order} =
               Orders.create_order(
                 buyer,
                 ctx.event.id,
                 [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 3}],
                 [
                   %{"seat_table_id" => ctx.t1.id, "seat_number" => 1},
                   %{"seat_table_id" => ctx.t1.id, "seat_number" => 2},
                   %{"seat_table_id" => ctx.t2.id, "seat_number" => 4}
                 ]
               )

      # Free order is paid+fulfilled inline.
      assert order.status == "paid"

      # 3 active assignments exist for the order.
      active =
        Repo.all(
          from a in SeatAssignment,
            where: a.order_id == ^order.id and is_nil(a.released_at)
        )

      assert length(active) == 3

      # Every assignment is linked to a pass and the pass has the seat_label.
      passes = Tickets.list_for_order(order)
      ticket_passes = Enum.filter(passes, &(&1.kind == "ticket"))
      assert length(ticket_passes) == 3
      assert Enum.all?(ticket_passes, &is_binary(&1.seat_label))

      labels = ticket_passes |> Enum.map(& &1.seat_label) |> Enum.sort()
      assert labels == [
               "Mesa Azul · Lugar 4",
               "Mesa Verde · Lugar 1",
               "Mesa Verde · Lugar 2"
             ]

      Enum.each(active, fn a -> assert is_binary(a.pass_id) end)
    end

    test "rejects with seat_count_mismatch when picks ≠ ticket quantity" do
      creator = make_creator()
      buyer = make_buyer()
      ctx = free_seated_event(creator)

      assert {:error, {:seat_count_mismatch, 1, 2}} =
               Orders.create_order(
                 buyer,
                 ctx.event.id,
                 [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 2}],
                 [%{"seat_table_id" => ctx.t1.id, "seat_number" => 1}]
               )
    end

    test "second buyer claiming a taken seat gets seat_taken and no order is created" do
      creator = make_creator()
      buyer_a = make_buyer()
      buyer_b = make_buyer()
      ctx = free_seated_event(creator)

      {:ok, _} =
        Orders.create_order(
          buyer_a,
          ctx.event.id,
          [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 1}],
          [%{"seat_table_id" => ctx.t1.id, "seat_number" => 1}]
        )

      assert {:error, {:seat_taken, _}} =
               Orders.create_order(
                 buyer_b,
                 ctx.event.id,
                 [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 1}],
                 [%{"seat_table_id" => ctx.t1.id, "seat_number" => 1}]
               )

      # Buyer B has no orders.
      assert Orders.list_orders(buyer_b) == []
    end

    test "validates picks required when seat_selection_enabled" do
      creator = make_creator()
      buyer = make_buyer()
      ctx = free_seated_event(creator)

      assert {:error, {:seat_count_mismatch, 0, 1}} =
               Orders.create_order(
                 buyer,
                 ctx.event.id,
                 [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 1}],
                 []
               )
    end
  end
end
