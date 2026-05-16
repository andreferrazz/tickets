defmodule BackendWeb.UserControllerAbacateFailureTest do
  # async: false because we swap the global :abacate_pay_module env to a
  # failing stub; other suites read the same env and would race.
  use BackendWeb.ConnCase, async: false

  alias Backend.Accounts

  setup do
    original = Application.get_env(:backend, :abacate_pay_module)
    Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayFailingMock)
    on_exit(fn -> Application.put_env(:backend, :abacate_pay_module, original) end)
    :ok
  end

  defp authed(conn) do
    email = "abacate_fail_#{:rand.uniform(999_999)}@example.com"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{token: token, user: user}} = Accounts.verify_code(email, code)
    {put_req_header(conn, "authorization", "Bearer #{token}"), user}
  end

  describe "PATCH /api/v1/me/profile with Abacate Pay down" do
    test "returns 502 abacate_unavailable and keeps the user row empty", %{conn: conn} do
      {conn, user} = authed(conn)

      conn =
        patch(conn, "/api/v1/me/profile", %{
          name: "Maria",
          cellphone: "+5511999999999",
          tax_id: "11144477735"
        })

      assert %{"error" => "abacate_unavailable"} = json_response(conn, 502)

      reloaded = Backend.Repo.get!(Backend.Accounts.User, user.id)
      assert is_nil(reloaded.name)
      assert is_nil(reloaded.abacate_customer_id)
    end
  end
end
