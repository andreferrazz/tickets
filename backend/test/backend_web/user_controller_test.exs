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

  describe "GET /api/v1/me/organizations" do
    alias Backend.Organizations

    test "returns the caller's memberships with role per org", %{conn: conn} do
      {conn, user} = authed(conn)
      {:ok, org_a} = Organizations.create_organization(%{name: "Alpha"})
      {:ok, org_b} = Organizations.create_organization(%{name: "Beta"})
      {:ok, _} = Organizations.add_member(org_a.id, user.id, "leader")
      {:ok, _} = Organizations.add_member(org_b.id, user.id, "participant")

      resp = conn |> get("/api/v1/me/organizations") |> json_response(200)

      assert [
               %{"name" => "Alpha", "role" => "leader", "id" => _},
               %{"name" => "Beta", "role" => "participant", "id" => _}
             ] = resp
    end

    test "returns [] when the user has no memberships", %{conn: conn} do
      {conn, _user} = authed(conn)
      assert [] = conn |> get("/api/v1/me/organizations") |> json_response(200)
    end

    test "returns 401 without token", %{conn: conn} do
      conn = get(conn, "/api/v1/me/organizations")
      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end
end
