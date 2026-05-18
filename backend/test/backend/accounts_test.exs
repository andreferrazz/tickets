defmodule Backend.AccountsTest do
  use Backend.DataCase, async: true

  alias Backend.Accounts

  describe "request_code/1" do
    test "creates an auth code and returns :ok" do
      assert {:ok, code} = Accounts.request_code("test@example.com")
      assert String.length(code) == 6
      assert Regex.match?(~r/^\d{6}$/, code)
    end

    test "invalidates previous unused code for same email" do
      {:ok, _code1} = Accounts.request_code("user@example.com")
      {:ok, code2} = Accounts.request_code("user@example.com")

      # Only the latest code should work
      assert {:ok, _} = Accounts.verify_code("user@example.com", code2)
    end

    test "normalises email (trims + downcases)" do
      assert {:ok, _} = Accounts.request_code("  USER@EXAMPLE.COM  ")

      {:ok, %{user: user}} =
        Accounts.verify_code("user@example.com", request_fresh_code("user@example.com"))

      assert user.email == "user@example.com"
    end
  end

  describe "verify_code/2" do
    test "creates a new user on first login" do
      code = request_fresh_code("new@example.com")
      assert {:ok, %{token: token, user: user}} = Accounts.verify_code("new@example.com", code)
      assert is_binary(token)
      assert user.email == "new@example.com"
      assert user.role == "buyer"
    end

    test "returns existing user on subsequent logins" do
      code1 = request_fresh_code("repeat@example.com")
      {:ok, %{user: user1}} = Accounts.verify_code("repeat@example.com", code1)

      code2 = request_fresh_code("repeat@example.com")
      {:ok, %{user: user2}} = Accounts.verify_code("repeat@example.com", code2)

      assert user1.id == user2.id
    end

    test "rejects wrong code" do
      _code = request_fresh_code("wrong@example.com")

      assert {:error, :invalid_or_expired_code} =
               Accounts.verify_code("wrong@example.com", "000000")
    end

    test "rejects already-used code" do
      code = request_fresh_code("used@example.com")
      {:ok, _} = Accounts.verify_code("used@example.com", code)
      assert {:error, :invalid_or_expired_code} = Accounts.verify_code("used@example.com", code)
    end
  end

  describe "get_user_by_token/1" do
    test "returns user for valid token" do
      code = request_fresh_code("token@example.com")
      {:ok, %{token: token, user: user}} = Accounts.verify_code("token@example.com", code)
      assert %Backend.Accounts.User{id: id} = Accounts.get_user_by_token(token)
      assert id == user.id
    end

    test "returns nil for unknown token" do
      assert nil == Accounts.get_user_by_token("not-a-real-token")
    end
  end

  describe "complete_profile/2" do
    test "saves all three fields and assigns abacate_customer_id" do
      user = verified_user("profile_ok@example.com")

      assert {:ok, updated} =
               Accounts.complete_profile(user, %{
                 "name" => "Maria Silva",
                 "cellphone" => "+5511999999999",
                 "tax_id" => "11144477735"
               })

      assert updated.name == "Maria Silva"
      assert updated.cellphone == "11999999999"
      assert updated.tax_id == "11144477735"
      assert updated.abacate_customer_id == "cust_test_11144477735"
      assert Backend.Accounts.User.profile_complete?(updated)
    end

    test "normalizes name, cellphone, and tax_id" do
      user = verified_user("profile_norm@example.com")

      assert {:ok, updated} =
               Accounts.complete_profile(user, %{
                 "name" => "  Joao  ",
                 "cellphone" => "(11) 99999-9999",
                 "tax_id" => "111.444.777-35"
               })

      assert updated.name == "Joao"
      assert updated.cellphone == "11999999999"
      assert updated.tax_id == "11144477735"
    end

    test "rejects missing fields with changeset error" do
      user = verified_user("profile_missing@example.com")

      assert {:error, %Ecto.Changeset{valid?: false}} =
               Accounts.complete_profile(user, %{"name" => "X"})
    end

    test "rejects malformed tax_id" do
      user = verified_user("profile_badtax@example.com")

      assert {:error, %Ecto.Changeset{} = cs} =
               Accounts.complete_profile(user, %{
                 "name" => "Maria",
                 "cellphone" => "+5511999999999",
                 "tax_id" => "abc"
               })

      assert %{tax_id: [_]} = errors_on(cs)
    end

    test "rejects a CPF with a bad check digit before calling Abacate" do
      user = verified_user("profile_badchecksum@example.com")

      assert {:error, %Ecto.Changeset{} = cs} =
               Accounts.complete_profile(user, %{
                 "name" => "Maria",
                 "cellphone" => "+5511999999999",
                 "tax_id" => "12345678900"
               })

      assert %{tax_id: [_]} = errors_on(cs)
    end

    test "rejects a non-mobile cellphone before calling Abacate" do
      user = verified_user("profile_landline@example.com")

      assert {:error, %Ecto.Changeset{} = cs} =
               Accounts.complete_profile(user, %{
                 "name" => "Maria",
                 "cellphone" => "1133334444",
                 "tax_id" => "11144477735"
               })

      assert %{cellphone: [_]} = errors_on(cs)
    end
  end

  describe "logout/1" do
    test "invalidates the session" do
      code = request_fresh_code("logout@example.com")
      {:ok, %{token: token}} = Accounts.verify_code("logout@example.com", code)

      assert :ok = Accounts.logout(token)
      assert nil == Accounts.get_user_by_token(token)
    end
  end

  # ---------------------------------------------------------------------------

  defp request_fresh_code(email) do
    {:ok, code} = Accounts.request_code(email)
    code
  end

  defp verified_user(email) do
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end
end
