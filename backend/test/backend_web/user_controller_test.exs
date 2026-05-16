defmodule BackendWeb.UserControllerTest do
  use BackendWeb.ConnCase, async: true

  alias Backend.Accounts

  defp authed(conn) do
    email = "user_ctrl_#{:rand.uniform(999_999)}@example.com"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)
    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  describe "PATCH /api/v1/me/profile" do
    test "saves profile and returns user with profile_complete + abacate id", %{conn: conn} do
      {conn, _user} = authed(conn)

      conn =
        patch(conn, "/api/v1/me/profile", %{
          name: "Maria",
          cellphone: "+5511999999999",
          tax_id: "11144477735"
        })

      resp = json_response(conn, 200)
      assert resp["name"] == "Maria"
      assert resp["tax_id"] == "11144477735"
      assert resp["abacate_customer_id"] == "cust_test_11144477735"
      assert resp["profile_complete"] == true
    end

    test "returns 400 when fields missing", %{conn: conn} do
      {conn, _user} = authed(conn)
      conn = patch(conn, "/api/v1/me/profile", %{name: "X"})
      assert %{"error" => _} = json_response(conn, 400)
    end

    test "returns 422 on bad tax_id", %{conn: conn} do
      {conn, _user} = authed(conn)

      conn =
        patch(conn, "/api/v1/me/profile", %{
          name: "Maria",
          cellphone: "+5511999999999",
          tax_id: "abc"
        })

      assert %{"error" => %{"tax_id" => [_ | _]}} = json_response(conn, 422)
    end

    test "returns 401 without token", %{conn: conn} do
      conn =
        patch(conn, "/api/v1/me/profile", %{
          name: "Maria",
          cellphone: "+5511999999999",
          tax_id: "11144477735"
        })

      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end

  describe "GET /api/v1/me after profile update" do
    test "returns the new fields", %{conn: conn} do
      {conn, _user} = authed(conn)

      patch(conn, "/api/v1/me/profile", %{
        name: "Maria",
        cellphone: "+5511999999999",
        tax_id: "11144477735"
      })

      resp = conn |> get("/api/v1/me") |> json_response(200)
      assert resp["name"] == "Maria"
      assert resp["profile_complete"] == true
    end
  end
end
