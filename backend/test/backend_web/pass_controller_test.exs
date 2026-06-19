defmodule BackendWeb.PassControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events, Orders, Tickets}

  defp path(event_id), do: "/api/v1/events/#{event_id}/passes/validate"
  defp path(event_id), do: "/api/v1/events/#{event_id}/passes/validate"

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

    if role == "creator" do
      {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{user.id}"})
      {:ok, _} = Backend.Organizations.add_member(org.id, user.id, "leader")
    end

    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  defp seed_event(creator) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => "Pass Fest",
        "starts_at" => "2027-10-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator, event.id, %{"name" => "GA"})

    {:ok, _batch} =
      Events.create_batch(creator, tt.id, %{"price_cents" => 1000, "quantity_total" => 10})

    {event, tt}
  end

  defp make_buyer do
    email = "buyer_#{:rand.uniform(999_999)}@pass_ctrl.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: buyer}} = Accounts.verify_code(email, code)
    buyer
  end

  defp seed_pass(creator) do
    {event, tt} = seed_event(creator)
    buyer = make_buyer()

    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
      ])

    {:ok, [pass], _} = Tickets.issue_for_order(order)
    {event, pass}
  end

  # Seeds an order with two extra items and returns the single combined extra pass.
  defp seed_extra_pass(creator) do
    {event, tt} = seed_event(creator)
    {:ok, section} = Events.create_section(creator, event.id, %{"title" => "Add-ons"})

    {:ok, shirt} =
      Events.create_extra(creator, event.id, %{
        "name" => "T-Shirt",
        "price_cents" => 4000,
        "section_id" => section.id
      })

    {:ok, cap} =
      Events.create_extra(creator, event.id, %{
        "name" => "Cap",
        "price_cents" => 2500,
        "section_id" => section.id
      })

    buyer = make_buyer()

    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1},
        %{"item_type" => "extra", "item_id" => shirt.id, "quantity" => 2},
        %{"item_type" => "extra", "item_id" => cap.id, "quantity" => 1}
      ])

    {:ok, passes, _} = Tickets.issue_for_order(order)
    extra_pass = Enum.find(passes, &(&1.kind == "extra"))
    {event, extra_pass}
  end

  describe "POST validate" do
    test "checks in the pass for an org member of the event", %{conn: conn} do
      {conn, creator} = authed_conn(conn, "creator")
      {event, pass} = seed_pass(creator)

      conn = post(conn, path(event.id), %{token: pass.token})
      conn = post(conn, path(event.id), %{token: pass.token})
      resp = json_response(conn, 200)

      assert resp["status"] == "checked_in"
      assert resp["pass"]["id"] == pass.id
      assert resp["pass"]["kind"] == "ticket"
      assert resp["pass"]["event_id"] == event.id
      assert resp["pass"]["extras"] == []
      assert is_binary(resp["pass"]["checked_in_at"])
    end

    test "returns the purchased items for an extra pass", %{conn: conn} do
      {conn, creator} = authed_conn(conn, "creator")
      {event, extra_pass} = seed_extra_pass(creator)

      resp = post(conn, path(event.id), %{token: extra_pass.token}) |> json_response(200)

      assert resp["status"] == "checked_in"
      assert resp["pass"]["kind"] == "extra"

      assert resp["pass"]["extras"] == [
               %{"name" => "T-Shirt", "quantity" => 2},
               %{"name" => "Cap", "quantity" => 1}
             ]
    end

    test "returns already_checked_in on second scan with original timestamp", %{conn: conn} do
      {conn, creator} = authed_conn(conn, "creator")
      {event, pass} = seed_pass(creator)
      {event, pass} = seed_pass(creator)

      first = post(conn, path(event.id), %{token: pass.token}) |> json_response(200)
      second = post(conn, path(event.id), %{token: pass.token}) |> json_response(200)
      first = post(conn, path(event.id), %{token: pass.token}) |> json_response(200)
      second = post(conn, path(event.id), %{token: pass.token}) |> json_response(200)

      assert first["status"] == "checked_in"
      assert second["status"] == "already_checked_in"
      assert second["pass"]["checked_in_at"] == first["pass"]["checked_in_at"]
    end

    test "allows a scan-only staff member of the org to check in a pass", %{conn: conn} do
      {_creator_conn, creator} = authed_conn(build_conn(), "creator")
      {event, pass} = seed_pass(creator)

      {staff_conn, staff} = authed_conn(conn, "buyer")
      [org] = Backend.Organizations.list_led_by(creator.id)
      {:ok, _} = Backend.Organizations.add_member(org.id, staff.id, "staff")

      resp = post(staff_conn, path(event.id), %{token: pass.token}) |> json_response(200)
      assert resp["status"] == "checked_in"
    end

    test "allows admin to check in any pass", %{conn: conn} do
      {_creator_conn, creator} = authed_conn(build_conn(), "creator")
      {event, pass} = seed_pass(creator)
      {_creator_conn, creator} = authed_conn(build_conn(), "creator")
      {event, pass} = seed_pass(creator)

      {admin_conn, _admin} = authed_conn(conn, "admin")
      resp = post(admin_conn, path(event.id), %{token: pass.token}) |> json_response(200)
      resp = post(admin_conn, path(event.id), %{token: pass.token}) |> json_response(200)
      assert resp["status"] == "checked_in"
    end

    test "returns 403 when the caller is not in the event's organization", %{conn: conn} do
      {_creator_conn, creator} = authed_conn(build_conn(), "creator")
      {event, pass} = seed_pass(creator)

      test "returns 403 when the caller is not in the event's organization", %{conn: conn} do
        {_creator_conn, creator} = authed_conn(build_conn(), "creator")
        {event, pass} = seed_pass(creator)

        {other_conn, _other} = authed_conn(conn, "creator")
        resp = post(other_conn, path(event.id), %{token: pass.token})
        resp = post(other_conn, path(event.id), %{token: pass.token})
        assert json_response(resp, 403) == %{"error" => "not authorized for this event"}
      end

      test "rejects a pass that belongs to a different event", %{conn: conn} do
        {conn, creator} = authed_conn(conn, "creator")
        {_event_a, pass} = seed_pass(creator)
        {event_b, _pass_b} = seed_pass(creator)

        resp = post(conn, path(event_b.id), %{token: pass.token})

        assert json_response(resp, 422) == %{"error" => "pass belongs to a different event"}
        # The mismatched pass must NOT be checked in.
        {:ok, reloaded} = Tickets.fetch_by_token(pass.token)
        assert is_nil(reloaded.checked_in_at)
      end

      test "rejects a pass that belongs to a different event", %{conn: conn} do
        {conn, creator} = authed_conn(conn, "creator")
        {_event_a, pass} = seed_pass(creator)
        {event_b, _pass_b} = seed_pass(creator)

        resp = post(conn, path(event_b.id), %{token: pass.token})

        assert json_response(resp, 422) == %{"error" => "pass belongs to a different event"}
        # The mismatched pass must NOT be checked in.
        {:ok, reloaded} = Tickets.fetch_by_token(pass.token)
        assert is_nil(reloaded.checked_in_at)
      end

      test "returns 404 for unknown token", %{conn: conn} do
        {conn, creator} = authed_conn(conn, "creator")
        {event, _pass} = seed_pass(creator)

        resp = post(conn, path(event.id), %{token: "does-not-exist"})
        {conn, creator} = authed_conn(conn, "creator")
        {event, _pass} = seed_pass(creator)

        resp = post(conn, path(event.id), %{token: "does-not-exist"})
        assert json_response(resp, 404) == %{"error" => "pass not found"}
      end

      test "returns 401 without auth", %{conn: conn} do
        resp = post(conn, path(Ecto.UUID.generate()), %{token: "anything"})
        resp = post(conn, path(Ecto.UUID.generate()), %{token: "anything"})
        assert json_response(resp, 401)
      end

      test "returns 400 without a token in the body", %{conn: conn} do
        {conn, creator} = authed_conn(conn, "creator")
        {event, _pass} = seed_pass(creator)

        resp = post(conn, path(event.id), %{})
        {conn, creator} = authed_conn(conn, "creator")
        {event, _pass} = seed_pass(creator)

        resp = post(conn, path(event.id), %{})
        assert json_response(resp, 400) == %{"error" => "token required"}
      end
    end
  end
end
