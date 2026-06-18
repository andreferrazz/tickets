defmodule BackendWeb.OrderControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events, Orders, Tickets}

  defp authed_conn(conn, role \\ "buyer") do
    email = "#{role}_#{:rand.uniform(999_999)}@order_ctrl.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)

    if role != "buyer" do
      Backend.Repo.update_all(
        from(u in Accounts.User, where: u.id == ^user.id),
        set: [role: role]
      )
    end

    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  defp setup_event_with_ticket do
    email = "creator_#{:rand.uniform(999_999)}@order_ctrl.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: creator}} = Accounts.verify_code(email, code)

    Backend.Repo.update_all(from(u in Accounts.User, where: u.id == ^creator.id),
      set: [role: "creator"]
    )

    creator = Backend.Repo.get!(Accounts.User, creator.id)

    {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{creator.id}"})
    {:ok, _} = Backend.Organizations.add_member(org.id, creator.id, "leader")

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Controller Fest",
        "starts_at" => "2027-06-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "Standard"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 3000, "quantity_total" => 50})

    {event, tt}
  end

  describe "POST /api/v1/orders" do
    test "creates an order and returns payment URL", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      conn =
        post(conn, "/api/v1/orders", %{
          event_id: event.id,
          items: [%{item_type: "ticket", item_id: tt.id, quantity: 1}]
        })

      resp = json_response(conn, 201)
      assert resp["status"] == "pending"
      assert resp["total_cents"] == 3000
      assert is_binary(resp["abacate_payment_url"])
      assert resp["event_title"] == "Controller Fest"
      assert length(resp["items"]) == 1
    end

    test "creates a boleto order when payment_method is BOLETO", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      conn =
        post(conn, "/api/v1/orders", %{
          event_id: event.id,
          items: [%{item_type: "ticket", item_id: tt.id, quantity: 1}],
          payment_method: "BOLETO"
        })

      resp = json_response(conn, 201)
      # The boleto (transparent) path returns a boleto viewing URL.
      assert resp["abacate_payment_url"] =~ "boleto"
    end

    test "returns 400 for an unknown payment_method", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      conn =
        post(conn, "/api/v1/orders", %{
          event_id: event.id,
          items: [%{item_type: "ticket", item_id: tt.id, quantity: 1}],
          payment_method: "BITCOIN"
        })

      assert %{"error" => error} = json_response(conn, 400)
      assert error =~ "invalid payment_method"
    end

    test "returns 409 when out of stock", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      conn =
        post(conn, "/api/v1/orders", %{
          event_id: event.id,
          items: [%{item_type: "ticket", item_id: tt.id, quantity: 999}]
        })

      assert %{"error" => "out of stock: Standard"} = json_response(conn, 409)
    end

    test "returns 400 without required params", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      conn = post(conn, "/api/v1/orders", %{})
      assert %{"error" => _} = json_response(conn, 400)
    end

    test "returns 401 without auth", %{conn: conn} do
      conn = post(conn, "/api/v1/orders", %{})
      assert json_response(conn, 401)
    end
  end

  describe "GET /api/v1/orders" do
    test "lists current user's orders", %{conn: conn} do
      {conn, user} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      Orders.create_order(user, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
      ])

      conn = get(conn, "/api/v1/orders")
      orders = json_response(conn, 200)
      assert length(orders) == 1
      assert hd(orders)["event_title"] == "Controller Fest"
    end
  end

  describe "GET /api/v1/orders/:id" do
    test "returns a specific order", %{conn: conn} do
      {conn, user} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      {:ok, order} =
        Orders.create_order(user, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      conn = get(conn, "/api/v1/orders/#{order.id}")
      resp = json_response(conn, 200)
      assert resp["id"] == order.id
      assert resp["total_cents"] == 6000
    end

    test "returns 404 for another user's order", %{conn: conn} do
      {other_conn, other_user} = authed_conn(conn)
      {_conn, user} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      {:ok, order} =
        Orders.create_order(user, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      _ = other_user
      conn = get(other_conn, "/api/v1/orders/#{order.id}")
      assert json_response(conn, 404)
    end
  end

  describe "GET /api/v1/orders/:id/passes" do
    test "returns the buyer's passes with base64 QR PNGs", %{conn: conn} do
      {conn, user} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      {:ok, order} =
        Orders.create_order(user, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      {:ok, _passes, :created} = Tickets.issue_for_order(order)

      conn = get(conn, "/api/v1/orders/#{order.id}/passes")
      passes = json_response(conn, 200)

      assert length(passes) == 2

      Enum.each(passes, fn p ->
        assert p["kind"] == "ticket"
        assert is_binary(p["token"])
        assert is_binary(p["qr_png_base64"])
        # PNG signature decoded from base64
        assert <<137, "PNG", _::binary>> = Base.decode64!(p["qr_png_base64"])
      end)
    end

    test "returns empty list before passes are issued", %{conn: conn} do
      {conn, user} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      {:ok, order} =
        Orders.create_order(user, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      conn = get(conn, "/api/v1/orders/#{order.id}/passes")
      assert json_response(conn, 200) == []
    end

    test "returns 404 for another user's order", %{conn: conn} do
      {other_conn, _other} = authed_conn(conn)
      {_buyer_conn, buyer} = authed_conn(conn)
      {event, tt} = setup_event_with_ticket()

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      conn = get(other_conn, "/api/v1/orders/#{order.id}/passes")
      assert json_response(conn, 404)
    end
  end

  describe "GET /api/v1/events/:event_id/orders" do
    defp authed_org_creator(conn) do
      email = "owner_#{:rand.uniform(999_999)}@order_ctrl.test"
      {:ok, code} = Accounts.request_code(email)
      {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)

      Backend.Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id),
        set: [role: "creator"]
      )

      user = Backend.Repo.get!(Accounts.User, user.id)

      {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{user.id}"})
      {:ok, _} = Backend.Organizations.add_member(org.id, user.id, "leader")

      {:ok, event} =
        Events.create_event(user, %{
          "title" => "Orders Endpoint Fest",
          "starts_at" => "2027-06-01T18:00:00Z",
          "status" => "published"
        })

      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "Standard"})

      {:ok, _batch} =
        Events.create_batch(user, tt.id, %{"price_cents" => 4000, "quantity_total" => 50})

      {put_req_header(conn, "authorization", "Bearer #{token}"), user, event, tt}
    end

    # Sets up one pending and one paid order for the given event, returns
    # {pending_order, paid_order, buyer}. Used by tests that exercise status
    # filtering and need both states present.
    defp setup_pending_and_paid(conn, event, tt) do
      {_buyer_conn, buyer} = authed_conn(conn)

      {:ok, pending} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      {:ok, paid} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
        ])

      {:ok, paid} =
        paid
        |> Ecto.Changeset.change(
          status: "paid",
          paid_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
        |> Backend.Repo.update()

      {pending, paid, buyer}
    end

    # GET /api/v1/events/$EVENT_ID/orders
    test "all orders, every status", %{conn: conn} do
      {owner_conn, _owner, event, tt} = authed_org_creator(conn)
      {pending, paid, buyer} = setup_pending_and_paid(conn, event, tt)

      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders")
      orders = json_response(conn, 200)

      ids = orders |> Enum.map(& &1["id"]) |> Enum.sort()
      assert ids == Enum.sort([pending.id, paid.id])

      o = Enum.find(orders, &(&1["id"] == pending.id))
      assert o["buyer_email"] == buyer.email
      # Profile not completed yet — name/phone are null by design.
      assert o["buyer_name"] == nil
      assert o["buyer_phone"] == nil
      # Pending order — payment_method and paid_at are null.
      assert o["payment_method"] == nil
      assert o["paid_at"] == nil
      assert [%{"name" => "Standard", "quantity" => 1, "unit_price_cents" => 4000}] = o["tickets"]
      assert o["extras"] == []
      # No passes checked in yet.
      assert o["validated_count"] == 0
    end

    # GET /api/v1/events/$EVENT_ID/orders — validated_count tracks checked-in passes
    test "validated_count counts checked-in ticket passes", %{conn: conn} do
      {owner_conn, owner, event, tt} = authed_org_creator(conn)
      {_buyer_conn, buyer} = authed_conn(conn)

      {:ok, order} =
        Orders.create_order(buyer, event.id, [
          %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 2}
        ])

      {:ok, [first_pass | _], :created} = Tickets.issue_for_order(order)
      {:ok, _, :checked_in} = Tickets.check_in(first_pass, owner)

      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders")
      o = conn |> json_response(200) |> Enum.find(&(&1["id"] == order.id))

      # 1 of 2 ticket passes scanned.
      assert o["validated_count"] == 1
      assert [%{"quantity" => 2}] = o["tickets"]
    end

    # GET /api/v1/events/$EVENT_ID/orders?status[]=paid
    test "only paid orders (repeated-key syntax)", %{conn: conn} do
      {owner_conn, _owner, event, tt} = authed_org_creator(conn)
      {_pending, paid, _buyer} = setup_pending_and_paid(conn, event, tt)

      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders?status[]=paid")
      ids = conn |> json_response(200) |> Enum.map(& &1["id"])
      assert ids == [paid.id]
    end

    # GET /api/v1/events/$EVENT_ID/orders?status[]=paid&status[]=pending
    test "paid + pending (repeated-key)", %{conn: conn} do
      {owner_conn, _owner, event, tt} = authed_org_creator(conn)
      {pending, paid, _buyer} = setup_pending_and_paid(conn, event, tt)

      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders?status[]=paid&status[]=pending")
      ids = conn |> json_response(200) |> Enum.map(& &1["id"]) |> Enum.sort()
      assert ids == Enum.sort([paid.id, pending.id])
    end

    # GET /api/v1/events/$EVENT_ID/orders?status=paid,pending
    test "paid + pending (comma-separated form)", %{conn: conn} do
      {owner_conn, _owner, event, tt} = authed_org_creator(conn)
      {pending, paid, _buyer} = setup_pending_and_paid(conn, event, tt)

      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders?status=paid,pending")
      ids = conn |> json_response(200) |> Enum.map(& &1["id"]) |> Enum.sort()
      assert ids == Enum.sort([paid.id, pending.id])
    end

    # GET /api/v1/events/$EVENT_ID/orders?status=bogus
    test "bad status -> 400", %{conn: conn} do
      {owner_conn, _owner, event, _tt} = authed_org_creator(conn)
      conn = get(owner_conn, "/api/v1/events/#{event.id}/orders?status=bogus")
      assert %{"error" => "invalid status", "value" => "bogus"} = json_response(conn, 400)
    end

    # GET /api/v1/events/00000000-0000-0000-0000-000000000000/orders
    test "unknown event id -> 404", %{conn: conn} do
      {owner_conn, _owner, _event, _tt} = authed_org_creator(conn)
      fake_id = "00000000-0000-0000-0000-000000000000"

      conn = get(owner_conn, "/api/v1/events/#{fake_id}/orders")
      assert json_response(conn, 404)
    end

    test "only admins and leaders can access orders", %{conn: conn} do
      {owner_conn, owner, event, tt} = authed_org_creator(conn)
      {_, _, _} = setup_pending_and_paid(conn, event, tt)
      [%{id: org_id} | _] = Backend.Organizations.list_for_user(owner.id)

      # 1. Leader of the event's org -> 200 (the owner is the org leader).
      assert owner_conn
             |> get("/api/v1/events/#{event.id}/orders")
             |> json_response(200)
             |> length() == 2

      # 2. Plain participant of the same org -> 404 (denied; no existence leak).
      {participant_conn, participant} = authed_conn(conn)
      {:ok, _} = Backend.Organizations.add_member(org_id, participant.id, "participant")

      assert participant_conn
             |> get("/api/v1/events/#{event.id}/orders")
             |> json_response(404)

      # 3. Outsider (no membership at all) -> 404.
      {outsider_conn, _outsider} = authed_conn(conn)

      assert outsider_conn
             |> get("/api/v1/events/#{event.id}/orders")
             |> json_response(404)

      # 4. Admin (no org membership) -> 200.
      {admin_conn, _admin} = authed_conn(conn, "admin")

      assert admin_conn
             |> get("/api/v1/events/#{event.id}/orders")
             |> json_response(200)
             |> length() == 2
    end
  end
end
