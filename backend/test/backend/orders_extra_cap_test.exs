defmodule Backend.OrdersExtraCapTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders}

  defp make_creator do
    email = "creator_#{:rand.uniform(999_999)}@extracap.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@extracap.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  # A published event + free ticket batch + section + caller-chosen extra(s).
  defp event_with_extra(creator, extra_attrs) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Cap Fest",
        "starts_at" => "2027-04-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "GA"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 0, "quantity_total" => 50})

    {:ok, section} = Events.create_section(creator, event.id, %{"title" => "Add-ons"})

    {:ok, extra} =
      Events.create_extra(
        creator,
        event.id,
        Map.merge(%{"section_id" => section.id, "price_cents" => 0}, extra_attrs)
      )

    %{event: event, ticket_type: tt, extra: extra}
  end

  describe "create_order/4 with limit_to_ticket_count" do
    test "rejects when capped extra quantity exceeds ticket count" do
      creator = make_creator()
      buyer = make_buyer()

      ctx =
        event_with_extra(creator, %{"name" => "Wristband", "limit_to_ticket_count" => true})

      assert {:error, {:extra_exceeds_tickets, "Wristband", 3, 2}} =
               Orders.create_order(buyer, ctx.event.id, [
                 %{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 2},
                 %{"item_type" => "extra", "item_id" => ctx.extra.id, "quantity" => 3}
               ])

      # No stock reserved on either side.
      assert Repo.get!(Backend.Events.ExtraItem, ctx.extra.id).quantity_sold == 0
    end

    test "allows capped extra quantity equal to ticket count" do
      creator = make_creator()
      buyer = make_buyer()

      ctx =
        event_with_extra(creator, %{"name" => "Wristband", "limit_to_ticket_count" => true})

      assert {:ok, order} =
               Orders.create_order(buyer, ctx.event.id, [
                 %{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 2},
                 %{"item_type" => "extra", "item_id" => ctx.extra.id, "quantity" => 2}
               ])

      # Free order is paid+fulfilled inline.
      assert order.status == "paid"
      assert Repo.get!(Backend.Events.ExtraItem, ctx.extra.id).quantity_sold == 2
    end

    test "uncapped extra still allows quantity greater than ticket count" do
      creator = make_creator()
      buyer = make_buyer()

      ctx =
        event_with_extra(creator, %{"name" => "Sticker", "limit_to_ticket_count" => false})

      assert {:ok, _order} =
               Orders.create_order(buyer, ctx.event.id, [
                 %{"item_type" => "ticket", "item_id" => ctx.ticket_type.id, "quantity" => 1},
                 %{"item_type" => "extra", "item_id" => ctx.extra.id, "quantity" => 5}
               ])

      assert Repo.get!(Backend.Events.ExtraItem, ctx.extra.id).quantity_sold == 5
    end
  end
end
