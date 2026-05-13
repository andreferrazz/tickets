defmodule Backend.InvitationsTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Invitations}

  defp creator_user(email \\ "inviter@invitations.test") do
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  describe "create_invitation/2" do
    test "creates a pending invitation and returns it" do
      creator = creator_user()

      assert {:ok, inv} = Invitations.create_invitation(creator, "newbie@example.com")
      assert inv.email == "newbie@example.com"
      assert inv.status == "pending"
      assert inv.inviter_id == creator.id
      assert is_binary(inv.token) and byte_size(inv.token) >= 32

      # Expires ~24h from now (allow a 60s window for test latency).
      diff = DateTime.diff(inv.expires_at, DateTime.utc_now())
      assert diff > 24 * 3600 - 60 and diff <= 24 * 3600 + 60
    end

    test "normalises email" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "  UPPER@EXAMPLE.COM  ")
      assert inv.email == "upper@example.com"
    end

    test "returns :already_invited when pending invitation exists" do
      creator = creator_user()
      {:ok, _} = Invitations.create_invitation(creator, "dup@example.com")

      assert {:error, :already_invited} =
               Invitations.create_invitation(creator, "dup@example.com")
    end
  end

  describe "list_invitations/1" do
    test "returns invitations sent by the creator" do
      creator = creator_user()
      other = creator_user("other@invitations.test")

      {:ok, _} = Invitations.create_invitation(creator, "a@example.com")
      {:ok, _} = Invitations.create_invitation(creator, "b@example.com")
      {:ok, _} = Invitations.create_invitation(other, "c@example.com")

      invs = Invitations.list_invitations(creator)
      assert length(invs) == 2
      assert Enum.all?(invs, &(&1.inviter_id == creator.id))
    end
  end

  describe "verify_code upgrades buyer to creator via invitation" do
    test "accepted invitation promotes the user" do
      creator = creator_user()
      {:ok, _} = Invitations.create_invitation(creator, "promoted@example.com")

      {:ok, code} = Accounts.request_code("promoted@example.com")
      {:ok, %{user: user}} = Accounts.verify_code("promoted@example.com", code)

      assert user.role == "creator"
    end

    test "expired invitation does not promote on login" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "stale@example.com")
      expire!(inv)

      {:ok, code} = Accounts.request_code("stale@example.com")
      {:ok, %{user: user}} = Accounts.verify_code("stale@example.com", code)

      assert user.role == "buyer"
    end
  end

  describe "accept_invitation/1" do
    test "creates a new user as creator and returns a session token" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "fresh@example.com")

      assert {:ok, %{token: token, user: user}} = Invitations.accept_invitation(inv.token)
      assert is_binary(token)
      assert user.email == "fresh@example.com"
      assert user.role == "creator"
      assert user.invited_by == creator.id

      assert Repo.get!(Backend.Invitations.Invitation, inv.id).status == "accepted"
    end

    test "promotes an existing buyer to creator" do
      creator = creator_user()
      {:ok, code} = Accounts.request_code("existing@example.com")
      {:ok, %{user: existing}} = Accounts.verify_code("existing@example.com", code)
      assert existing.role == "buyer"

      {:ok, inv} = Invitations.create_invitation(creator, "existing@example.com")

      assert {:ok, %{user: user}} = Invitations.accept_invitation(inv.token)
      assert user.id == existing.id
      assert user.role == "creator"
    end

    test "leaves an existing creator's role unchanged but marks invite accepted" do
      creator = creator_user()
      other = creator_user("already@invitations.test")
      {:ok, inv} = Invitations.create_invitation(creator, other.email)

      assert {:ok, %{user: user}} = Invitations.accept_invitation(inv.token)
      assert user.id == other.id
      assert user.role == "creator"
      assert Repo.get!(Backend.Invitations.Invitation, inv.id).status == "accepted"
    end

    test "returns :invalid_token for unknown tokens" do
      assert {:error, :invalid_token} = Invitations.accept_invitation("does-not-exist")
    end

    test "returns :expired when past expires_at" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "expired@example.com")
      expire!(inv)

      assert {:error, :expired} = Invitations.accept_invitation(inv.token)
    end

    test "returns :already_accepted when consumed twice" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "twice@example.com")

      {:ok, _} = Invitations.accept_invitation(inv.token)
      assert {:error, :already_accepted} = Invitations.accept_invitation(inv.token)
    end
  end

  describe "duplicate detection respects expiry" do
    test "expired pending invitation does not block a re-send" do
      creator = creator_user()
      {:ok, inv} = Invitations.create_invitation(creator, "resend@example.com")
      expire!(inv)

      assert {:ok, _} = Invitations.create_invitation(creator, "resend@example.com")
    end
  end

  defp expire!(inv) do
    past = DateTime.add(DateTime.utc_now(), -3600, :second) |> DateTime.truncate(:second)

    Repo.update_all(
      from(i in Backend.Invitations.Invitation, where: i.id == ^inv.id),
      set: [expires_at: past]
    )
  end
end
