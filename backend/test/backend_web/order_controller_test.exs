defmodule BackendWeb.OrderControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events, Orders}

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

    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Controller Fest",
        "starts_at" => "2027-06-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} =
      Events.create_ticket_type(creator, event.id, %{
        "name" => "Standard",
        "price_cents" => 3000,
        "quantity_total" => 50
      })

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
end
