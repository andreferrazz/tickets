defmodule Backend.AccountsAbacateFailureTest do
  # async: false because we swap the global :abacate_pay_module env to a
  # failing stub; other suites read the same env and would race.
  use Backend.DataCase, async: false

  alias Backend.Accounts

  setup do
    original = Application.get_env(:backend, :abacate_pay_module)
    Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayFailingMock)
    on_exit(fn -> Application.put_env(:backend, :abacate_pay_module, original) end)
    :ok
  end

  describe "complete_profile/2" do
    test "returns :abacate_unavailable and writes nothing to the user row" do
      user = verified_user("profile_fail@example.com")

      assert {:error, :abacate_unavailable} =
               Accounts.complete_profile(user, %{
                 "name" => "Maria",
                 "cellphone" => "+5511999999999",
                 "tax_id" => "11144477735"
               })

      reloaded = Repo.get!(Backend.Accounts.User, user.id)
      assert is_nil(reloaded.name)
      assert is_nil(reloaded.cellphone)
      assert is_nil(reloaded.tax_id)
      assert is_nil(reloaded.abacate_customer_id)
      refute Backend.Accounts.User.profile_complete?(reloaded)
    end
  end

  defp verified_user(email) do
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end
end
