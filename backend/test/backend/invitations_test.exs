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
  end
end
