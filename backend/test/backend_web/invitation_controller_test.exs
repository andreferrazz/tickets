defmodule BackendWeb.InvitationControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.Accounts

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@inv_ctrl.test"
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

  describe "POST /api/v1/invitations" do
    test "creator sends an invitation", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      conn = post(conn, "/api/v1/invitations", %{email: "newbie@example.com"})
      resp = json_response(conn, 201)
      assert resp["email"] == "newbie@example.com"
      assert resp["status"] == "pending"
    end

    test "returns 409 for duplicate pending invitation", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      post(conn, "/api/v1/invitations", %{email: "dup@example.com"})
      conn = post(conn, "/api/v1/invitations", %{email: "dup@example.com"})
      assert %{"error" => _} = json_response(conn, 409)
    end

    test "buyer gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "buyer")
      conn = post(conn, "/api/v1/invitations", %{email: "x@example.com"})
      assert json_response(conn, 403)
    end

    test "returns 400 without email", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      conn = post(conn, "/api/v1/invitations", %{})
      assert json_response(conn, 400)
    end
  end

  describe "GET /api/v1/invitations" do
    test "creator lists their invitations", %{conn: conn} do
      {conn, _} = authed_conn(conn, "creator")
      post(conn, "/api/v1/invitations", %{email: "a@example.com"})
      post(conn, "/api/v1/invitations", %{email: "b@example.com"})

      conn = get(conn, "/api/v1/invitations")
      assert length(json_response(conn, 200)) == 2
    end

    test "buyer gets 403", %{conn: conn} do
      {conn, _} = authed_conn(conn, "buyer")
      conn = get(conn, "/api/v1/invitations")
      assert json_response(conn, 403)
    end
  end
end
