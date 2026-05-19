defmodule BackendWeb.InvitationControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.Accounts
  alias Backend.Organizations

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@inv_ctrl.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)

    user =
      if role != "buyer" do
        Backend.Repo.update_all(
          from(u in Accounts.User, where: u.id == ^user.id),
          set: [role: role]
        )

        Backend.Repo.get!(Accounts.User, user.id)
      else
        user
      end

    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  # Creator with a backing org + leader membership. Used to exercise the
  # "leader invites participant" branch.
  defp leader_conn(conn) do
    {auth, user} = authed_conn(conn, "creator")
    {:ok, org} = Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Organizations.add_member(org.id, user.id, "leader")
    {auth, user, org}
  end

  describe "POST /api/v1/invitations" do
    test "admin sends a leader invitation that creates a new organization",
         %{conn: conn} do
      {conn, _} = authed_conn(conn, "admin")

      conn =
        post(conn, "/api/v1/invitations", %{
          email: "newbie@example.com",
          organization_name: "Brand New Org"
        })

      resp = json_response(conn, 201)
      assert resp["email"] == "newbie@example.com"
      assert resp["status"] == "pending"
      assert resp["role"] == "leader"
      assert is_binary(resp["organization_id"])
    end

    test "admin without organization_name defaults to '<local>'s Org'",
         %{conn: conn} do
      {conn, _} = authed_conn(conn, "admin")
      conn = post(conn, "/api/v1/invitations", %{email: "alice@example.com"})
      resp = json_response(conn, 201)
      org = Organizations.get_organization(resp["organization_id"])
      assert org.name == "alice's Org"
    end

    test "returns 409 for duplicate pending invitation", %{conn: conn} do
      {conn, _} = authed_conn(conn, "admin")

      post(conn, "/api/v1/invitations", %{
        email: "dup@example.com",
        organization_name: "A"
      })

      conn =
        post(conn, "/api/v1/invitations", %{
          email: "dup@example.com",
          organization_name: "B"
        })

      assert %{"error" => _} = json_response(conn, 409)
    end

    test "leader invites a participant to their existing org", %{conn: conn} do
      {auth, _user, org} = leader_conn(conn)
      conn = post(auth, "/api/v1/invitations", %{email: "newteam@example.com"})
      resp = json_response(conn, 201)
      assert resp["role"] == "participant"
      assert resp["organization_id"] == org.id
    end

    test "creator with no org gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      conn = post(conn, "/api/v1/invitations", %{email: "x@example.com"})
      assert json_response(conn, 403)
    end

    test "buyer gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "buyer")
      conn = post(conn, "/api/v1/invitations", %{email: "x@example.com"})
      assert json_response(conn, 403)
    end

    test "returns 400 without email", %{conn: conn} do
      {conn, _} = authed_conn(conn, "admin")
      conn = post(conn, "/api/v1/invitations", %{})
      assert json_response(conn, 400)
    end
  end

  describe "POST /api/v1/invitations/accept" do
    test "consumes a valid token and returns a session", %{conn: conn} do
      {admin_conn, _} = authed_conn(conn, "admin")

      post(admin_conn, "/api/v1/invitations", %{
        email: "acceptme@example.com",
        organization_name: "Accept Co"
      })

      inv =
        Backend.Repo.one!(
          from i in Backend.Invitations.Invitation, where: i.email == "acceptme@example.com"
        )

      resp =
        build_conn()
        |> post("/api/v1/invitations/accept", %{token: inv.token})
        |> json_response(200)

      assert is_binary(resp["token"])
      assert resp["user"]["email"] == "acceptme@example.com"
      assert resp["user"]["role"] == "creator"
      assert Organizations.leader?(resp["user"]["id"], inv.organization_id)
    end

    test "returns 422 for an unknown token", %{conn: conn} do
      conn = post(conn, "/api/v1/invitations/accept", %{token: "nope"})
      assert %{"error" => "invalid_token"} = json_response(conn, 422)
    end

    test "returns 400 without a token", %{conn: conn} do
      conn = post(conn, "/api/v1/invitations/accept", %{})
      assert json_response(conn, 400)
    end
  end

  describe "GET /api/v1/invitations" do
    test "admin lists their invitations", %{conn: conn} do
      {conn, _} = authed_conn(conn, "admin")
      post(conn, "/api/v1/invitations", %{email: "a@example.com", organization_name: "A"})
      post(conn, "/api/v1/invitations", %{email: "b@example.com", organization_name: "B"})

      conn = get(conn, "/api/v1/invitations")
      assert length(json_response(conn, 200)) == 2
    end

    test "leader lists invitations for their org", %{conn: conn} do
      {auth, _user, _org} = leader_conn(conn)
      post(auth, "/api/v1/invitations", %{email: "p1@example.com"})
      post(auth, "/api/v1/invitations", %{email: "p2@example.com"})

      conn = get(auth, "/api/v1/invitations")
      assert length(json_response(conn, 200)) == 2
    end

    test "buyer gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "buyer")
      conn = get(conn, "/api/v1/invitations")
      assert json_response(conn, 403)
    end
  end
end
