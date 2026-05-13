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
      {:ok, %{user: user}} = Accounts.verify_code("user@example.com", request_fresh_code("user@example.com"))
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
      assert {:error, :invalid_or_expired_code} = Accounts.verify_code("wrong@example.com", "000000")
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
end
