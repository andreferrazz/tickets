defmodule BackendWeb.AuthControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.Accounts

  describe "POST /api/v1/auth/request-code" do
    test "returns sent: true for valid email", %{conn: conn} do
      conn = post(conn, "/api/v1/auth/request-code", %{email: "a@b.com"})
      assert %{"sent" => true} = json_response(conn, 200)
    end

    test "returns 400 when email missing", %{conn: conn} do
      conn = post(conn, "/api/v1/auth/request-code", %{})
      assert %{"error" => _} = json_response(conn, 400)
    end
  end

  describe "POST /api/v1/auth/verify-code" do
    test "returns token and user on valid code", %{conn: conn} do
      {:ok, code} = Accounts.request_code("verify@example.com")
      conn = post(conn, "/api/v1/auth/verify-code", %{email: "verify@example.com", code: code})
      resp = json_response(conn, 200)
      assert is_binary(resp["token"])
      assert resp["user"]["email"] == "verify@example.com"
    end

    test "returns 401 on wrong code", %{conn: conn} do
      Accounts.request_code("wrong@example.com")
      conn = post(conn, "/api/v1/auth/verify-code", %{email: "wrong@example.com", code: "000000"})
      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 when params missing", %{conn: conn} do
      conn = post(conn, "/api/v1/auth/verify-code", %{})
      assert %{"error" => _} = json_response(conn, 400)
    end
  end

  describe "DELETE /api/v1/auth/logout" do
    test "succeeds with valid bearer token", %{conn: conn} do
      {:ok, code} = Accounts.request_code("lo@example.com")
      {:ok, %{token: token}} = Accounts.verify_code("lo@example.com", code)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> delete("/api/v1/auth/logout")

      assert %{"logged_out" => true} = json_response(conn, 200)
      assert nil == Accounts.get_user_by_token(token)
    end

    test "succeeds even without a token", %{conn: conn} do
      conn = delete(conn, "/api/v1/auth/logout")
      assert %{"logged_out" => true} = json_response(conn, 200)
    end
  end

  describe "GET /api/v1/me" do
    test "returns current user", %{conn: conn} do
      {:ok, code} = Accounts.request_code("me@example.com")
      {:ok, %{token: token, user: user}} = Accounts.verify_code("me@example.com", code)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> get("/api/v1/me")

      resp = json_response(conn, 200)
      assert resp["id"] == user.id
      assert resp["email"] == "me@example.com"
    end

    test "returns 401 without token", %{conn: conn} do
      conn = get(conn, "/api/v1/me")
      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end
end
