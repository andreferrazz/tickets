defmodule BackendWeb.EventControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events}

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp authed_conn(conn, role \\ "buyer") do
    email = "#{role}_#{:rand.uniform(999_999)}@test.com"
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

  defp event_params do
    %{title: "My Fest", starts_at: "2027-06-01T18:00:00Z", status: "published"}
  end

  # ---------------------------------------------------------------------------

  describe "GET /api/v1/events" do
    test "returns published events", %{conn: conn} do
      {conn, user} = authed_conn(conn, "creator")

      Events.create_event(user, %{
        "title" => "Public",
        "starts_at" => "2027-01-01T00:00:00Z",
        "status" => "published"
      })

      Events.create_event(user, %{"title" => "Draft", "starts_at" => "2027-01-02T00:00:00Z"})

      conn = get(conn, "/api/v1/events")
      events = json_response(conn, 200)
      titles = Enum.map(events, & &1["title"])
      assert "Public" in titles
      refute "Draft" in titles
    end

    test "returns 401 without auth", %{conn: conn} do
      conn = get(conn, "/api/v1/events")
      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end

  describe "GET /api/v1/events/:id" do
    test "returns event with ticket_types and extras", %{conn: conn} do
      {conn, user} = authed_conn(conn, "creator")

      {:ok, event} =
        Events.create_event(user, %{
          "title" => "Detail",
          "starts_at" => "2027-01-01T00:00:00Z",
          "status" => "published"
        })

      Events.create_ticket_type(user, event.id, %{
        "name" => "VIP",
        "price_cents" => 10_000,
        "quantity_total" => 50
      })

      conn = get(conn, "/api/v1/events/#{event.id}")
      resp = json_response(conn, 200)
      assert resp["title"] == "Detail"
      assert [%{"name" => "VIP"}] = resp["ticket_types"]
      assert resp["extras"] == []
    end

    test "returns 404 for unknown event", %{conn: conn} do
      {conn, _} = authed_conn(conn)
      conn = get(conn, "/api/v1/events/#{Ecto.UUID.generate()}")
      assert %{"error" => _} = json_response(conn, 404)
    end
  end

  describe "POST /api/v1/events" do
    test "creator can create an event", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      conn = post(conn, "/api/v1/events", event_params())
      resp = json_response(conn, 201)
      assert resp["title"] == "My Fest"
      assert resp["status"] == "published"
    end

    test "buyer gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "buyer")
      conn = post(conn, "/api/v1/events", event_params())
      assert %{"error" => "creator role required"} = json_response(conn, 403)
    end

    test "returns 422 without required fields", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      conn = post(conn, "/api/v1/events", %{description: "no title"})
      assert %{"error" => _} = json_response(conn, 422)
    end
  end

  describe "PUT /api/v1/events/:id" do
    test "owner updates their event", %{conn: conn} do
      {conn, user} = authed_conn(conn, "creator")

      {:ok, event} =
        Events.create_event(user, %{"title" => "Old", "starts_at" => "2027-01-01T00:00:00Z"})

      conn =
        put(conn, "/api/v1/events/#{event.id}", %{title: "New", starts_at: "2027-01-01T00:00:00Z"})

      assert json_response(conn, 200)["title"] == "New"
    end

    test "non-owner gets 403", %{conn: conn} do
      {creator_conn, creator} = authed_conn(conn, "creator")
      {other_conn, _} = authed_conn(conn, "creator")

      {:ok, event} =
        Events.create_event(creator, %{"title" => "Mine", "starts_at" => "2027-01-01T00:00:00Z"})

      _ = creator_conn

      conn =
        put(other_conn, "/api/v1/events/#{event.id}", %{
          title: "Hack",
          starts_at: "2027-01-01T00:00:00Z"
        })

      assert json_response(conn, 403)
    end
  end

  describe "DELETE /api/v1/events/:id" do
    test "owner deletes their event", %{conn: conn} do
      {conn, user} = authed_conn(conn, "creator")

      {:ok, event} =
        Events.create_event(user, %{"title" => "Bye", "starts_at" => "2027-01-01T00:00:00Z"})

      conn = delete(conn, "/api/v1/events/#{event.id}")
      assert %{"deleted" => true} = json_response(conn, 200)
    end
  end
end
