defmodule Backend.TicketsTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Orders, Repo, Tickets}
  alias Backend.Tickets.Pass

  defp make_user(role \\ "buyer") do
    email = "#{role}_#{:rand.uniform(999_999)}@tix.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)

    if role != "buyer" do
      Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: role])
    end

    Repo.get!(Accounts.User, user.id)
  end

  defp event_with_inventory(creator) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Tickets Fest",
        "starts_at" => "2027-09-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "VIP"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 7000, "quantity_total" => 20})

    {:ok, section} = Events.create_section(creator, event.id, %{"title" => "Add-ons"})

    {:ok, extra} =
      Events.create_extra(creator, event.id, %{
        "name" => "T-Shirt",
        "price_cents" => 4000,
        "section_id" => section.id
      })

    {event, tt, extra}
  end

  defp place_order(buyer, event, tt, extra, opts) do
    ticket_qty = Keyword.get(opts, :ticket_qty, 3)
    include_extra = Keyword.get(opts, :extra, true)

    items =
      [%{"item_type" => "ticket", "item_id" => tt.id, "quantity" => ticket_qty}] ++
        if(include_extra,
          do: [%{"item_type" => "extra", "item_id" => extra.id, "quantity" => 2}],
          else: []
        )

    {:ok, order} = Orders.create_order(buyer, event.id, items)
    order
  end

  describe "issue_for_order/1" do
    test "creates one pass per ticket unit plus a single combined extras pass" do
      creator = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 3)

      assert {:ok, passes, :created} = Tickets.issue_for_order(order)
      assert length(passes) == 4

      kinds = passes |> Enum.map(& &1.kind) |> Enum.frequencies()
      assert kinds == %{"ticket" => 3, "extra" => 1}

      assert Enum.all?(passes, &(byte_size(&1.token) >= 20))
      assert passes |> Enum.map(& &1.token) |> Enum.uniq() |> length() == 4
    end

    test "skips the extras pass when the order has no extras" do
      creator = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 1, extra: false)

      assert {:ok, [pass], :created} = Tickets.issue_for_order(order)
      assert pass.kind == "ticket"
    end

    test "is idempotent: re-running returns the same passes with :existed" do
      creator = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 2)

      {:ok, first, :created} = Tickets.issue_for_order(order)
      {:ok, second, :existed} = Tickets.issue_for_order(order)

      assert Enum.map(first, & &1.id) |> Enum.sort() ==
               Enum.map(second, & &1.id) |> Enum.sort()

      assert Repo.aggregate(from(p in Pass, where: p.order_id == ^order.id), :count) == 3
    end
  end

  describe "fetch_by_token/1 and check_in/2" do
    test "fetch_by_token returns the pass" do
      creator = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 1, extra: false)
      {:ok, [pass], _} = Tickets.issue_for_order(order)

      assert {:ok, found} = Tickets.fetch_by_token(pass.token)
      assert found.id == pass.id
    end

    test "fetch_by_token returns not_found for unknown token" do
      assert {:error, :not_found} = Tickets.fetch_by_token("nope")
    end

    test "check_in flips the pass once, then reports already_checked_in" do
      creator = make_user("creator")
      scanner = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 1, extra: false)
      {:ok, [pass], _} = Tickets.issue_for_order(order)

      assert {:ok, scanned, :checked_in} = Tickets.check_in(pass, scanner)
      assert %DateTime{} = scanned.checked_in_at
      assert scanned.checked_in_by_user_id == scanner.id

      assert {:ok, scanned2, :already_checked_in} = Tickets.check_in(scanned, scanner)
      assert scanned2.checked_in_at == scanned.checked_in_at
    end
  end

  describe "qr_png/1" do
    test "returns binary PNG data" do
      creator = make_user("creator")
      buyer = make_user()
      {event, tt, extra} = event_with_inventory(creator)
      order = place_order(buyer, event, tt, extra, ticket_qty: 1, extra: false)
      {:ok, [pass], _} = Tickets.issue_for_order(order)

      png = Tickets.qr_png(pass)
      assert is_binary(png)
      assert <<137, "PNG", _::binary>> = png
    end
  end
end
