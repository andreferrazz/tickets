defmodule Backend.EventsTest do
  use Backend.DataCase, async: true

  alias Backend.Accounts
  alias Backend.Events
  alias Backend.Events.{Event, ExtraItem, TicketType}

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp creator_user do
    email = "creator_#{:rand.uniform(999_999)}@events.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp buyer_user do
    email = "buyer_#{:rand.uniform(999_999)}@events.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp published_event(user) do
    {:ok, event} =
      Events.create_event(user, %{
        "title" => "Test Event",
        "starts_at" => "2027-01-01T10:00:00Z",
        "status" => "published"
      })

    event
  end

  # ---------------------------------------------------------------------------
  # Events CRUD
  # ---------------------------------------------------------------------------

  describe "create_event/2" do
    test "creates a draft event for a creator" do
      user = creator_user()

      assert {:ok, event} =
               Events.create_event(user, %{
                 "title" => "My Fest",
                 "starts_at" => "2027-06-01T18:00:00Z"
               })

      assert event.title == "My Fest"
      assert event.status == "draft"
      assert event.creator_id == user.id
    end

    test "returns error when title is missing" do
      user = creator_user()

      assert {:error, changeset} =
               Events.create_event(user, %{"starts_at" => "2027-01-01T00:00:00Z"})

      assert %{title: _} = errors_on(changeset)
    end
  end

  describe "list_events/0" do
    test "returns only published events" do
      user = creator_user()
      published_event(user)
      Events.create_event(user, %{"title" => "Draft", "starts_at" => "2027-01-01T00:00:00Z"})

      events = Events.list_events()
      assert Enum.all?(events, &(&1.status == "published"))
    end
  end

  describe "get_event/1" do
    test "returns event with preloaded associations" do
      user = creator_user()
      event = published_event(user)

      {:ok, _tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "VIP",
          "price_cents" => 5000,
          "quantity_total" => 100
        })

      found = Events.get_event(event.id)
      assert found.id == event.id
      assert [%TicketType{name: "VIP"}] = found.ticket_types
      # Every event has a default "Addons" section auto-created on insert.
      assert [%{title: "Addons", extras: []}] = found.extra_item_sections
    end

    test "returns nil for unknown id" do
      assert nil == Events.get_event(Ecto.UUID.generate())
    end
  end

  describe "update_event/3" do
    test "owner can update their event" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, updated} = Events.update_event(user, event.id, %{"title" => "New Name"})
      assert updated.title == "New Name"
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      assert {:error, :forbidden} = Events.update_event(other, event.id, %{"title" => "Hack"})
    end

    test "unknown event returns not_found" do
      user = creator_user()
      assert {:error, :not_found} = Events.update_event(user, Ecto.UUID.generate(), %{})
    end
  end

  describe "delete_event/2" do
    test "owner can soft-delete their event" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, _} = Events.delete_event(user, event.id)

      # row still exists but is invisible to context reads
      row = Repo.get!(Event, event.id)
      refute is_nil(row.deleted_at)
      assert nil == Events.get_event(event.id)
    end

    test "cascades deleted_at to ticket types and extras" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "GA",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      {:ok, ex} = Events.create_extra(user, event.id, %{"name" => "Cap", "price_cents" => 200})

      assert {:ok, _} = Events.delete_event(user, event.id)

      assert %TicketType{deleted_at: tt_at} = Repo.get!(TicketType, tt.id)
      assert %ExtraItem{deleted_at: ex_at} = Repo.get!(ExtraItem, ex.id)
      refute is_nil(tt_at)
      refute is_nil(ex_at)
    end

    test "cascade preserves an already-soft-deleted child's timestamp" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "Early",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      assert {:ok, _} = Events.delete_ticket_type(user, tt.id)
      original = Repo.get!(TicketType, tt.id).deleted_at

      assert {:ok, _} = Events.delete_event(user, event.id)
      assert Repo.get!(TicketType, tt.id).deleted_at == original
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      assert {:error, :forbidden} = Events.delete_event(other, event.id)
    end

    test "already-deleted event returns not_found" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, _} = Events.delete_event(user, event.id)
      assert {:error, :not_found} = Events.delete_event(user, event.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Ticket types
  # ---------------------------------------------------------------------------

  describe "create_ticket_type/3" do
    test "adds a ticket type to the owner's event" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "General"})

      assert tt.event_id == event.id
      assert tt.name == "General"
    end

    test "returns forbidden for non-owner" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)

      assert {:error, :forbidden} =
               Events.create_ticket_type(other, event.id, %{"name" => "Hack"})
    end
  end

  describe "create_batch/3" do
    test "creates batches in sequence with their own Abacate Pay product" do
      user = creator_user()
      event = published_event(user)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "VIP"})

      assert {:ok, b1} =
               Events.create_batch(user, tt.id, %{
                 "price_cents" => 5000,
                 "quantity_total" => 10
               })

      assert {:ok, b2} =
               Events.create_batch(user, tt.id, %{
                 "price_cents" => 7000,
                 "quantity_total" => 5
               })

      assert b1.sequence == 1
      assert b2.sequence == 2
      assert b1.abacate_product_id == "prod_test_batch_#{b1.id}"
      assert b2.abacate_product_id == "prod_test_batch_#{b2.id}"
    end

    test "creates a free batch without calling Abacate Pay" do
      user = creator_user()
      event = published_event(user)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "Free RSVP"})

      assert {:ok, batch} =
               Events.create_batch(user, tt.id, %{
                 "price_cents" => 0,
                 "quantity_total" => 50
               })

      assert batch.price_cents == 0
      assert is_nil(batch.abacate_product_id)
    end

    test "returns forbidden for a ticket type the user doesn't own" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "VIP"})

      assert {:error, :forbidden} =
               Events.create_batch(other, tt.id, %{"price_cents" => 1000, "quantity_total" => 1})
    end
  end

  describe "close_batch/2 and active_batch/1" do
    test "close advances the active batch to the next sequence" do
      user = creator_user()
      event = published_event(user)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "VIP"})

      {:ok, b1} =
        Events.create_batch(user, tt.id, %{"price_cents" => 100, "quantity_total" => 10})

      {:ok, b2} =
        Events.create_batch(user, tt.id, %{"price_cents" => 200, "quantity_total" => 10})

      assert Events.active_batch(tt).id == b1.id

      {:ok, closed} = Events.close_batch(user, b1.id)
      refute is_nil(closed.closed_at)
      refute closed.auto_closed

      assert Events.active_batch(tt).id == b2.id
    end
  end

  describe "delete_batch/2" do
    test "deletes a batch with no sales" do
      user = creator_user()
      event = published_event(user)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "VIP"})

      {:ok, b} =
        Events.create_batch(user, tt.id, %{"price_cents" => 100, "quantity_total" => 10})

      assert {:ok, _} = Events.delete_batch(user, b.id)
      assert is_nil(Repo.get(Backend.Events.TicketBatch, b.id))
    end

    test "refuses to delete a batch with sales" do
      user = creator_user()
      event = published_event(user)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "VIP"})

      {:ok, b} =
        Events.create_batch(user, tt.id, %{"price_cents" => 100, "quantity_total" => 10})

      # Simulate a sale by bumping quantity_sold directly.
      Repo.update_all(
        from(x in Backend.Events.TicketBatch, where: x.id == ^b.id),
        inc: [quantity_sold: 1]
      )

      assert {:error, :batch_has_sales} = Events.delete_batch(user, b.id)
    end
  end

  describe "delete_ticket_type/2" do
    test "owner soft-deletes their ticket type" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "A",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      assert {:ok, _} = Events.delete_ticket_type(user, tt.id)

      row = Repo.get!(TicketType, tt.id)
      refute is_nil(row.deleted_at)
      # absent from the event's preloaded ticket_types
      reloaded = Events.get_event(event.id)
      assert Enum.empty?(reloaded.ticket_types)
    end
  end

  # ---------------------------------------------------------------------------
  # Extra items
  # ---------------------------------------------------------------------------

  describe "create_extra/3" do
    test "adds an extra to the owner's event and attaches an Abacate Pay product id" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, extra} =
               Events.create_extra(user, event.id, %{
                 "name" => "T-Shirt",
                 "price_cents" => 3500
               })

      assert extra.event_id == event.id
      assert is_nil(extra.quantity_total)
      assert extra.abacate_product_id == "prod_test_extra_#{extra.id}"
    end

    test "creates a free extra without calling Abacate Pay" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, extra} =
               Events.create_extra(user, event.id, %{
                 "name" => "Welcome Gift",
                 "price_cents" => 0
               })

      assert extra.price_cents == 0
      assert is_nil(extra.abacate_product_id)
    end
  end

  describe "delete_extra/2" do
    test "owner soft-deletes their extra item" do
      user = creator_user()
      event = published_event(user)
      {:ok, extra} = Events.create_extra(user, event.id, %{"name" => "Hat", "price_cents" => 500})
      assert {:ok, _} = Events.delete_extra(user, extra.id)

      row = Repo.get!(ExtraItem, extra.id)
      refute is_nil(row.deleted_at)
      reloaded = Events.get_event(event.id)
      assert Enum.flat_map(reloaded.extra_item_sections, & &1.extras) == []
    end
  end

  # ---------------------------------------------------------------------------
  # Extra item sections
  # ---------------------------------------------------------------------------

  alias Backend.Events.ExtraItemSection

  defp default_section(event_id) do
    Repo.one!(from s in ExtraItemSection, where: s.event_id == ^event_id, limit: 1)
  end

  describe "create_event/2 + default section" do
    test "auto-creates one default 'Addons' section" do
      user = creator_user()

      {:ok, event} =
        Events.create_event(user, %{"title" => "X", "starts_at" => "2027-01-01T00:00:00Z"})

      assert %ExtraItemSection{title: "Addons", position: 0} = default_section(event.id)
    end
  end

  describe "create_section/3" do
    test "owner can create a section" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, section} =
               Events.create_section(user, event.id, %{
                 "title" => "Meals",
                 "description" => "Optional add-ons for hungry attendees",
                 "position" => 1
               })

      assert section.event_id == event.id
      assert section.title == "Meals"
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      assert {:error, :forbidden} = Events.create_section(other, event.id, %{"title" => "X"})
    end
  end

  describe "update_section/3" do
    test "owner can rename their section" do
      user = creator_user()
      event = published_event(user)
      {:ok, s} = Events.create_section(user, event.id, %{"title" => "Old"})
      assert {:ok, updated} = Events.update_section(user, s.id, %{"title" => "New"})
      assert updated.title == "New"
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      {:ok, s} = Events.create_section(creator, event.id, %{"title" => "X"})
      assert {:error, :forbidden} = Events.update_section(other, s.id, %{"title" => "Y"})
    end
  end

  describe "delete_section/2" do
    test "owner can delete an empty section" do
      user = creator_user()
      event = published_event(user)
      {:ok, s} = Events.create_section(user, event.id, %{"title" => "Empty"})
      assert {:ok, _} = Events.delete_section(user, s.id)
      assert Repo.get!(ExtraItemSection, s.id).deleted_at != nil
    end

    test "blocks deletion when section still has live extras" do
      user = creator_user()
      event = published_event(user)
      {:ok, s} = Events.create_section(user, event.id, %{"title" => "T-Shirts"})

      {:ok, _extra} =
        Events.create_extra(user, event.id, %{
          "name" => "Tee",
          "price_cents" => 100,
          "section_id" => s.id
        })

      assert {:error, :section_not_empty} = Events.delete_section(user, s.id)
    end

    test "delete_event cascades deleted_at to sections" do
      user = creator_user()
      event = published_event(user)
      {:ok, s} = Events.create_section(user, event.id, %{"title" => "Extras"})
      assert {:ok, _} = Events.delete_event(user, event.id)
      assert Repo.get!(ExtraItemSection, s.id).deleted_at != nil
    end
  end

  describe "create_extra/3 with sections" do
    test "rejects a section_id that belongs to a different event" do
      user = creator_user()
      event_a = published_event(user)
      event_b = published_event(user)
      {:ok, s_b} = Events.create_section(user, event_b.id, %{"title" => "Other"})

      assert {:error, :section_not_found} =
               Events.create_extra(user, event_a.id, %{
                 "name" => "Tee",
                 "price_cents" => 100,
                 "section_id" => s_b.id
               })
    end

    test "places the extra in the requested section" do
      user = creator_user()
      event = published_event(user)
      {:ok, s} = Events.create_section(user, event.id, %{"title" => "Meals"})

      {:ok, extra} =
        Events.create_extra(user, event.id, %{
          "name" => "Lunch",
          "price_cents" => 2500,
          "section_id" => s.id
        })

      assert extra.section_id == s.id
    end
  end

  # ---------------------------------------------------------------------------
  # event_stats/2
  # ---------------------------------------------------------------------------

  describe "event_stats/2" do
    alias Backend.Orders

    defp stats_event_with_ticket(creator) do
      event = published_event(creator)
      {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "General"})

      {:ok, batch} =
        Events.create_batch(creator, tt.id, %{"price_cents" => 5000, "quantity_total" => 10})

      {event, tt, batch}
    end

    test "owner sees totals; pending order reserves stock but doesn't add revenue" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      {:ok, _order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      assert {:ok, stats} = Events.event_stats(creator, event.id)
      assert stats.totals.orders_paid == 0
      assert stats.totals.orders_pending == 1
      assert stats.totals.revenue_cents == 0
      assert stats.totals.tickets_sold == 2
      assert stats.totals.tickets_capacity == 10
    end

    test "paid order contributes to revenue and per-ticket revenue_cents" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 3}
        ])

      {:ok, _} = Orders.mark_paid_by_checkout(order.abacate_checkout_id)

      assert {:ok, stats} = Events.event_stats(creator, event.id)
      assert stats.totals.orders_paid == 1
      assert stats.totals.revenue_cents == 15_000
      assert stats.totals.tickets_sold == 3
      [tt_stat] = stats.ticket_types
      assert tt_stat.sold == 3
      assert tt_stat.capacity == 10
      assert tt_stat.revenue_cents == 15_000
      assert [%{sold: 3, capacity: 10, price_cents: 5000}] = tt_stat.batches
    end

    test "fees_cents and net_revenue_cents account for the per-method Abacate fee" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      # Three paid orders: PIX, CARD 1x, CARD 6x. R$50 each (price_cents=5000).
      orders =
        for _ <- 1..3 do
          {:ok, order} =
            Orders.create_order(buyer, event.id, [
              %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
            ])

          order
        end

      [pix_order, card1x_order, card6x_order] = orders

      {:ok, _} =
        Orders.mark_paid_by_checkout(pix_order.abacate_checkout_id, %{payment_method: "PIX"})

      {:ok, _} =
        Orders.mark_paid_by_checkout(card1x_order.abacate_checkout_id, %{
          payment_method: "CARD",
          card_installments: 1
        })

      {:ok, _} =
        Orders.mark_paid_by_checkout(card6x_order.abacate_checkout_id, %{
          payment_method: "CARD",
          card_installments: 6
        })

      assert {:ok, stats} = Events.event_stats(creator, event.id)

      # PIX:     80 cents flat
      # CARD 1x: 3.50% of 5000 + 60 = 175 + 60 = 235
      # CARD 6x: 4.00% of 5000 + 60 = 200 + 60 = 260
      assert stats.totals.gross_revenue_cents == 15_000
      assert stats.totals.fees_cents == 80 + 235 + 260
      assert stats.totals.net_revenue_cents == 15_000 - (80 + 235 + 260)
    end

    test "uses Abacate's reported platform_fee_cents over the hardcoded table" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      # Real Abacate platformFee (e.g. 114 cents on a R$50 CARD 3x order). The
      # hardcoded formula would predict 4% * 5000 + 60 = 260 — we want the
      # actual reported figure to win.
      {:ok, _} =
        Orders.mark_paid_by_checkout(order.abacate_checkout_id, %{
          payment_method: "CARD",
          card_installments: 3,
          platform_fee_cents: 114
        })

      assert {:ok, stats} = Events.event_stats(creator, event.id)
      assert stats.totals.fees_cents == 114
      assert stats.totals.net_revenue_cents == 5_000 - 114
    end

    test "paid order without payment_method falls back to PIX fee" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      # No payment_info passed — mimics a legacy paid order.
      {:ok, _} = Orders.mark_paid_by_checkout(order.abacate_checkout_id)

      assert {:ok, stats} = Events.event_stats(creator, event.id)
      assert stats.totals.gross_revenue_cents == 5_000
      assert stats.totals.fees_cents == 80
      assert stats.totals.net_revenue_cents == 4_920
    end

    test "admin can read another creator's stats" do
      creator = creator_user()
      admin = creator_user()
      Repo.update_all(from(u in Accounts.User, where: u.id == ^admin.id), set: [role: "admin"])
      admin = Repo.get!(Accounts.User, admin.id)

      {event, _tt, _batch} = stats_event_with_ticket(creator)
      assert {:ok, _stats} = Events.event_stats(admin, event.id)
    end

    test "non-owner gets :not_found (no ownership leak)" do
      creator = creator_user()
      stranger = creator_user()
      {event, _tt, _batch} = stats_event_with_ticket(creator)

      assert {:error, :not_found} = Events.event_stats(stranger, event.id)
    end

    test "unknown event id returns :not_found" do
      creator = creator_user()
      assert {:error, :not_found} = Events.event_stats(creator, Ecto.UUID.generate())
    end

    test "list_extra_buyers sums quantity per user across orders; owner-only" do
      creator = creator_user()
      stranger = creator_user()
      buyer = buyer_user()
      Repo.update_all(from(u in Accounts.User, where: u.id == ^buyer.id),
        set: [name: "Alice", tax_id: "12345678901"]
      )

      event = published_event(creator)
      {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "General"})
      {:ok, _b} = Events.create_batch(creator, tt.id, %{"price_cents" => 1000, "quantity_total" => 10})

      {:ok, x} =
        Events.create_extra(creator, event.id, %{"name" => "Shirt", "price_cents" => 500})

      # Two pending orders from the same buyer; quantities should sum.
      {:ok, _o1} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1},
          %{"item_type" => "extra", "item_id" => x.id, "quantity" => 2}
        ])

      {:ok, _o2} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1},
          %{"item_type" => "extra", "item_id" => x.id, "quantity" => 3}
        ])

      assert {:ok, [row]} = Events.list_extra_buyers(creator, x.id)
      assert row.name == "Alice"
      assert row.tax_id == "12345678901"
      assert row.quantity == 5

      assert {:error, :not_found} = Events.list_extra_buyers(stranger, x.id)
    end

    test "recent_orders lists most recent first with buyer email and item_count" do
      creator = creator_user()
      buyer = buyer_user()
      {event, tt, _batch} = stats_event_with_ticket(creator)

      {:ok, _o1} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      assert {:ok, stats} = Events.event_stats(creator, event.id)
      assert [recent] = stats.recent_orders
      assert recent.buyer_email == buyer.email
      assert recent.item_count == 2
      assert recent.status == "pending"
    end
  end
end
