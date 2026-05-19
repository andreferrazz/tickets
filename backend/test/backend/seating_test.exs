defmodule Backend.SeatingTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders}
  alias Backend.Events.{Seating, SeatTable}

  defp make_creator do
    email = "creator_#{:rand.uniform(999_999)}@seating.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@seating.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp seated_event(creator, opts \\ []) do
    seats = Keyword.get(opts, :seats_per_table, 4)
    price = Keyword.get(opts, :price_cents, 5000)
    qty = Keyword.get(opts, :quantity_total, 20)

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Seated Fest",
        "starts_at" => "2027-04-01T18:00:00Z",
        "status" => "published",
        "seat_selection_enabled" => true,
        "seats_per_table" => seats
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "General"})

    {:ok, batch} =
      Events.create_batch(creator, tt.id, %{
        "price_cents" => price,
        "quantity_total" => qty
      })

    {:ok, t1} = Events.create_seat_table(creator, event.id, %{"name" => "Mesa Verde"})
    {:ok, t2} = Events.create_seat_table(creator, event.id, %{"name" => "Mesa Azul"})

    %{event: event, ticket_type: tt, batch: batch, t1: t1, t2: t2}
  end

  describe "create_seat_table/3" do
    test "creates a table and increments positions" do
      creator = make_creator()
      %{event: event} = seated_event(creator)

      assert {:ok, t3} = Events.create_seat_table(creator, event.id, %{"name" => "Mesa Rosa"})
      assert t3.position == 2
    end

    test "rejects duplicate names within the same event" do
      creator = make_creator()
      %{event: event} = seated_event(creator)

      assert {:error, cs} =
               Events.create_seat_table(creator, event.id, %{"name" => "Mesa Verde"})

      assert "has already been taken" in errors_on(cs)[:event_id]
    end

    test "non-owner cannot create" do
      creator = make_creator()
      stranger = make_creator()
      %{event: event} = seated_event(creator)

      assert {:error, :forbidden} =
               Events.create_seat_table(stranger, event.id, %{"name" => "x"})
    end
  end

  describe "delete_seat_table/2" do
    test "soft-deletes when no active assignments" do
      creator = make_creator()
      %{t1: t1} = seated_event(creator)

      assert {:ok, _} = Events.delete_seat_table(creator, t1.id)
      assert %SeatTable{deleted_at: %DateTime{}} = Repo.get!(SeatTable, t1.id)
    end

    test "refuses when the table has active assignments" do
      creator = make_creator()
      buyer = make_buyer()
      ctx = seated_event(creator)

      {:ok, _order} =
        Orders.create_order(
          buyer,
          ctx.event.id,
          [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 1}],
          [%{"seat_table_id" => ctx.t1.id, "seat_number" => 1}]
        )

      assert {:error, :table_has_assignments} =
               Events.delete_seat_table(creator, ctx.t1.id)
    end
  end

  describe "seating_snapshot/1" do
    test "returns nil when seat selection is off" do
      creator = make_creator()

      {:ok, event} =
        Events.create_event(creator, %{
          "title" => "Plain",
          "starts_at" => "2027-04-01T18:00:00Z",
          "status" => "published"
        })

      assert nil == Seating.seating_snapshot(event)
    end

    test "lists tables with taken seats" do
      creator = make_creator()
      buyer = make_buyer()
      ctx = seated_event(creator)

      {:ok, _order} =
        Orders.create_order(
          buyer,
          ctx.event.id,
          [%{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 2}],
          [
            %{"seat_table_id" => ctx.t1.id, "seat_number" => 1},
            %{"seat_table_id" => ctx.t1.id, "seat_number" => 3}
          ]
        )

      event = Repo.get!(Backend.Events.Event, ctx.event.id)
      snapshot = Seating.seating_snapshot(event)
      assert snapshot.seats_per_table == 4

      verde = Enum.find(snapshot.tables, &(&1.name == "Mesa Verde"))
      assert verde.taken_seats == [1, 3]

      azul = Enum.find(snapshot.tables, &(&1.name == "Mesa Azul"))
      assert azul.taken_seats == []
    end
  end

  describe "validate_picks/3" do
    test "passes when count matches ticket quantity and seats are in range" do
      creator = make_creator()
      ctx = seated_event(creator)
      event = Repo.get!(Backend.Events.Event, ctx.event.id)

      picks = [%{"seat_table_id" => ctx.t1.id, "seat_number" => 2}]

      assert {:ok, [%{seat_table_id: _, seat_number: 2}]} =
               Seating.validate_picks(event, picks, 1)
    end

    test "rejects mismatched pick count" do
      creator = make_creator()
      ctx = seated_event(creator)
      event = Repo.get!(Backend.Events.Event, ctx.event.id)

      assert {:error, {:seat_count_mismatch, 2, 1}} =
               Seating.validate_picks(
                 event,
                 [
                   %{"seat_table_id" => ctx.t1.id, "seat_number" => 1},
                   %{"seat_table_id" => ctx.t1.id, "seat_number" => 2}
                 ],
                 1
               )
    end

    test "rejects out-of-range seat numbers" do
      creator = make_creator()
      ctx = seated_event(creator)
      event = Repo.get!(Backend.Events.Event, ctx.event.id)

      assert {:error, {:invalid_seat_pick, _}} =
               Seating.validate_picks(
                 event,
                 [%{"seat_table_id" => ctx.t1.id, "seat_number" => 99}],
                 1
               )
    end

    test "rejects table from another event" do
      creator = make_creator()
      ctx = seated_event(creator)
      other = seated_event(creator)
      event = Repo.get!(Backend.Events.Event, ctx.event.id)

      assert {:error, {:invalid_seat_pick, _}} =
               Seating.validate_picks(
                 event,
                 [%{"seat_table_id" => other.t1.id, "seat_number" => 1}],
                 1
               )
    end

    test "rejects duplicate picks" do
      creator = make_creator()
      ctx = seated_event(creator)
      event = Repo.get!(Backend.Events.Event, ctx.event.id)

      picks = [
        %{"seat_table_id" => ctx.t1.id, "seat_number" => 1},
        %{"seat_table_id" => ctx.t1.id, "seat_number" => 1}
      ]

      assert {:error, {:invalid_seat_pick, _}} = Seating.validate_picks(event, picks, 2)
    end
  end
end
