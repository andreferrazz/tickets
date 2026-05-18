defmodule BackendWeb.PassControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events, Orders, Tickets}

  @path "/api/v1/passes/validate"

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@pass_ctrl.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)

    if role != "buyer" do
      Backend.Repo.update_all(
        from(u in Accounts.User, where: u.id == ^user.id),
        set: [role: role]
      )
    end

    user = Backend.Repo.get!(Accounts.User, user.id)
    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  defp seed_pass(creator) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Pass Fest",
        "starts_at" => "2027-10-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "GA"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 1000, "quantity_total" => 10})

    buyer_email = "buyer_#{:rand.uniform(999_999)}@pass_ctrl.test"
    {:ok, code} = Accounts.request_code(buyer_email)
    {:ok, %{user: buyer}} = Accounts.verify_code(buyer_email, code)

    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
      ])

    {:ok, [pass], _} = Tickets.issue_for_order(order)
    {event, pass}
  end

  describe "POST #{@path}" do
    test "checks in the pass for the event creator", %{conn: conn} do
      {conn, creator} = authed_conn(conn, "creator")
      {event, pass} = seed_pass(creator)
      _ = event

      conn = post(conn, @path, %{token: pass.token})
      resp = json_response(conn, 200)

      assert resp["status"] == "checked_in"
      assert resp["pass"]["id"] == pass.id
      assert resp["pass"]["kind"] == "ticket"
      assert is_binary(resp["pass"]["checked_in_at"])
    end

    test "returns already_checked_in on second scan with original timestamp", %{conn: conn} do
      {conn, creator} = authed_conn(conn, "creator")
      {_event, pass} = seed_pass(creator)

      first = post(conn, @path, %{token: pass.token}) |> json_response(200)
      second = post(conn, @path, %{token: pass.token}) |> json_response(200)

      assert first["status"] == "checked_in"
      assert second["status"] == "already_checked_in"
      assert second["pass"]["checked_in_at"] == first["pass"]["checked_in_at"]
    end

    test "allows admin to check in any pass", %{conn: conn} do
      creator_conn = build_conn()
      {_creator_conn, creator} = authed_conn(creator_conn, "creator")
      {_event, pass} = seed_pass(creator)

      {admin_conn, _admin} = authed_conn(conn, "admin")
      resp = post(admin_conn, @path, %{token: pass.token}) |> json_response(200)
      assert resp["status"] == "checked_in"
    end

    test "returns 403 when the caller is not the event creator", %{conn: conn} do
      creator = build_conn() |> authed_conn("creator") |> elem(1)
      {_event, pass} = seed_pass(creator)

      {other_conn, _other} = authed_conn(conn, "creator")
      resp = post(other_conn, @path, %{token: pass.token})
      assert json_response(resp, 403) == %{"error" => "not authorized for this event"}
    end

    test "returns 404 for unknown token", %{conn: conn} do
      {conn, _user} = authed_conn(conn, "creator")
      resp = post(conn, @path, %{token: "does-not-exist"})
      assert json_response(resp, 404) == %{"error" => "pass not found"}
    end

    test "returns 401 without auth", %{conn: conn} do
      resp = post(conn, @path, %{token: "anything"})
      assert json_response(resp, 401)
    end

    test "returns 400 without a token in the body", %{conn: conn} do
      {conn, _user} = authed_conn(conn, "creator")
      resp = post(conn, @path, %{})
      assert json_response(resp, 400) == %{"error" => "token required"}
    end
  end
end
