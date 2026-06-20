defmodule BackendWeb.OrganizationControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Events, Organizations}

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@org_ctrl.test"
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

  defp leader_setup(conn) do
    {auth, user} = authed_conn(conn, "creator")
    {:ok, org} = Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Organizations.add_member(org.id, user.id, "leader")
    {auth, user, org}
  end

  describe "GET /api/v1/organizations/:id" do
    test "leader fetches their org", %{conn: conn} do
      {auth, _user, org} = leader_setup(conn)
      conn = get(auth, "/api/v1/organizations/#{org.id}")
      assert json_response(conn, 200)["name"] == org.name
    end

    test "admin can fetch any org", %{conn: conn} do
      {_, _, org} = leader_setup(conn)
      {admin_conn, _} = authed_conn(conn, "admin")

      conn = get(admin_conn, "/api/v1/organizations/#{org.id}")
      assert json_response(conn, 200)["id"] == org.id
    end

    test "non-member non-admin gets 403", %{conn: conn} do
      {_, _, org} = leader_setup(conn)
      {outsider_auth, _} = authed_conn(conn, "creator")

      conn = get(outsider_auth, "/api/v1/organizations/#{org.id}")
      assert %{"error" => _} = json_response(conn, 403)
    end

    test "returns 404 for unknown org", %{conn: conn} do
      {admin_conn, _} = authed_conn(conn, "admin")
      conn = get(admin_conn, "/api/v1/organizations/#{Ecto.UUID.generate()}")
      assert %{"error" => _} = json_response(conn, 404)
    end
  end

  describe "PATCH /api/v1/organizations/:id" do
    test "leader renames their org", %{conn: conn} do
      {auth, _user, org} = leader_setup(conn)
      conn = patch(auth, "/api/v1/organizations/#{org.id}", %{name: "Renamed"})
      assert json_response(conn, 200)["name"] == "Renamed"
    end

    test "participant gets 403", %{conn: conn} do
      {_, _, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      conn = patch(participant_auth, "/api/v1/organizations/#{org.id}", %{name: "Nope"})
      assert json_response(conn, 403)
    end

    test "blank name returns 422", %{conn: conn} do
      {auth, _user, org} = leader_setup(conn)
      conn = patch(auth, "/api/v1/organizations/#{org.id}", %{name: ""})
      assert %{"error" => _} = json_response(conn, 422)
    end
  end

  describe "DELETE /api/v1/organizations/:id" do
    test "leader deletes their empty org", %{conn: conn} do
      {auth, _user, org} = leader_setup(conn)
      conn = delete(auth, "/api/v1/organizations/#{org.id}")
      assert %{"deleted" => true} = json_response(conn, 200)
    end

    test "leader is refused when org has active events", %{conn: conn} do
      {auth, user, org} = leader_setup(conn)

      {:ok, _event} =
        Events.create_event(user, %{
          "title" => "E",
          "starts_at" => "2027-01-01T10:00:00Z",
          "status" => "published",
          "organization_id" => org.id
        })

      conn = delete(auth, "/api/v1/organizations/#{org.id}")
      assert %{"error" => _} = json_response(conn, 409)
    end

    test "participant gets 403", %{conn: conn} do
      {_, _, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      conn = delete(participant_auth, "/api/v1/organizations/#{org.id}")
      assert %{"error" => _} = json_response(conn, 403)
    end

    test "admin can delete any org", %{conn: conn} do
      {_, _, org} = leader_setup(conn)
      {admin_conn, _} = authed_conn(conn, "admin")

      conn = delete(admin_conn, "/api/v1/organizations/#{org.id}")
      assert %{"deleted" => true} = json_response(conn, 200)
    end

    test "returns 404 for unknown org", %{conn: conn} do
      {admin_conn, _} = authed_conn(conn, "admin")
      conn = delete(admin_conn, "/api/v1/organizations/#{Ecto.UUID.generate()}")
      assert %{"error" => _} = json_response(conn, 404)
    end
  end
end
