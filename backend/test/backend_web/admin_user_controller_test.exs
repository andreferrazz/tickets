defmodule BackendWeb.AdminUserControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.Accounts

  defp authed_conn(conn, role) do
    email = "#{role}_#{:rand.uniform(999_999)}@admin_users.test"
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

  describe "GET /api/v1/admin/users" do
    test "admin lists every user", %{conn: conn} do
      {admin_conn, admin} = authed_conn(conn, "admin")
      {_, other} = authed_conn(conn, "buyer")

      ids = admin_conn |> get("/api/v1/admin/users") |> json_response(200) |> Enum.map(& &1["id"])
      assert admin.id in ids
      assert other.id in ids
    end

    test "non-admin gets 403", %{conn: conn} do
      {buyer_conn, _} = authed_conn(conn, "buyer")
      conn = get(buyer_conn, "/api/v1/admin/users")
      assert %{"error" => _} = json_response(conn, 403)
    end

    test "unauthenticated gets 401", %{conn: conn} do
      assert get(conn, "/api/v1/admin/users").status == 401
    end
  end

  describe "POST /api/v1/admin/users/:id/impersonate" do
    test "admin gets a token that resolves to the target user", %{conn: conn} do
      {admin_conn, _} = authed_conn(conn, "admin")
      {_, target} = authed_conn(conn, "buyer")

      %{"token" => token} =
        admin_conn
        |> post("/api/v1/admin/users/#{target.id}/impersonate")
        |> json_response(200)

      assert Accounts.get_user_by_token(token).id == target.id
    end

    test "non-admin gets 403", %{conn: conn} do
      {buyer_conn, _} = authed_conn(conn, "buyer")
      {_, target} = authed_conn(conn, "creator")

      conn = post(buyer_conn, "/api/v1/admin/users/#{target.id}/impersonate")
      assert %{"error" => _} = json_response(conn, 403)
    end

    test "unknown id returns 404", %{conn: conn} do
      {admin_conn, _} = authed_conn(conn, "admin")
      conn = post(admin_conn, "/api/v1/admin/users/#{Ecto.UUID.generate()}/impersonate")
      assert %{"error" => _} = json_response(conn, 404)
    end
  end
end
