defmodule BackendWeb.MembershipControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.{Accounts, Organizations}

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@membership_ctrl.test"
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

  describe "GET /api/v1/organizations/:id/members" do
    test "leader lists members with email and role", %{conn: conn} do
      {auth, leader, org} = leader_setup(conn)
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "staff")

      rows = auth |> get("/api/v1/organizations/#{org.id}/members") |> json_response(200)
      roles = Map.new(rows, &{&1["user_id"], &1["role"]})

      assert roles[leader.id] == "leader"
      assert roles[member.id] == "staff"
    end

    test "a participant can list members", %{conn: conn} do
      {_auth, leader, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      rows =
        participant_auth |> get("/api/v1/organizations/#{org.id}/members") |> json_response(200)

      ids = Enum.map(rows, & &1["user_id"])
      assert leader.id in ids
      assert participant.id in ids
    end

    test "a staff member gets 403", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {staff_auth, staff} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, staff.id, "staff")

      assert staff_auth
             |> get("/api/v1/organizations/#{org.id}/members")
             |> json_response(403)
    end
  end

  describe "PATCH /api/v1/organizations/:id/members/:user_id" do
    test "leader flips a participant to staff", %{conn: conn} do
      {auth, _leader, org} = leader_setup(conn)
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "participant")

      resp =
        auth
        |> patch("/api/v1/organizations/#{org.id}/members/#{member.id}", %{role: "staff"})
        |> json_response(200)

      assert resp["role"] == "staff"
      refute Organizations.can_manage?(member.id, org.id)
    end

    test "refuses to change the leader's role with 403", %{conn: conn} do
      {auth, leader, org} = leader_setup(conn)

      assert auth
             |> patch("/api/v1/organizations/#{org.id}/members/#{leader.id}", %{role: "staff"})
             |> json_response(403)

      assert Organizations.leader?(leader.id, org.id)
    end

    test "returns 404 for a non-member", %{conn: conn} do
      {auth, _leader, org} = leader_setup(conn)
      {_, outsider} = authed_conn(conn, "buyer")

      assert auth
             |> patch("/api/v1/organizations/#{org.id}/members/#{outsider.id}", %{role: "staff"})
             |> json_response(404)
    end

    test "a participant can flip another member's role", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "staff")

      resp =
        participant_auth
        |> patch("/api/v1/organizations/#{org.id}/members/#{member.id}", %{role: "participant"})
        |> json_response(200)

      assert resp["role"] == "participant"
    end

    test "a staff member cannot change roles (403)", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {staff_auth, staff} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, staff.id, "staff")

      assert staff_auth
             |> patch("/api/v1/organizations/#{org.id}/members/#{staff.id}", %{
               role: "participant"
             })
             |> json_response(403)
    end
  end

  describe "DELETE /api/v1/organizations/:id/members/:user_id" do
    test "leader removes a member", %{conn: conn} do
      {auth, _leader, org} = leader_setup(conn)
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "staff")

      assert auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{member.id}")
             |> response(204)

      refute Organizations.member?(member.id, org.id)
    end

    test "a participant removes a member", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "staff")

      assert participant_auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{member.id}")
             |> response(204)

      refute Organizations.member?(member.id, org.id)
    end

    test "refuses self-removal with 403", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert participant_auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{participant.id}")
             |> json_response(403)

      assert Organizations.member?(participant.id, org.id)
    end

    test "refuses to remove the leader with 403", %{conn: conn} do
      {_auth, leader, org} = leader_setup(conn)
      {participant_auth, participant} = authed_conn(conn, "creator")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert participant_auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{leader.id}")
             |> json_response(403)

      assert Organizations.leader?(leader.id, org.id)
    end

    test "a staff member cannot remove anyone (403)", %{conn: conn} do
      {_auth, _leader, org} = leader_setup(conn)
      {staff_auth, staff} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, staff.id, "staff")
      {_, member} = authed_conn(conn, "buyer")
      {:ok, _} = Organizations.add_member(org.id, member.id, "participant")

      assert staff_auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{member.id}")
             |> json_response(403)

      assert Organizations.member?(member.id, org.id)
    end

    test "returns 404 for a non-member target", %{conn: conn} do
      {auth, _leader, org} = leader_setup(conn)
      {_, outsider} = authed_conn(conn, "buyer")

      assert auth
             |> delete("/api/v1/organizations/#{org.id}/members/#{outsider.id}")
             |> json_response(404)
    end
  end
end
