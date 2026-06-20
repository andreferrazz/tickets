defmodule Backend.InvitationsTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Invitations}

  defp creator_user(email \\ "inviter@invitations.test") do
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    user = Repo.get!(Accounts.User, user.id)
    {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Backend.Organizations.add_member(org.id, user.id, "leader")
    user
  end

  # Leader of a fresh org plus a member added with `role` to that same org.
  defp org_member(role, email) do
    leader = creator_user("leader_#{:rand.uniform(999_999)}@invitations.test")
    [org] = Backend.Organizations.list_led_by(leader.id)

    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    {:ok, _} = Backend.Organizations.add_member(org.id, user.id, role)
    {Repo.get!(Accounts.User, user.id), org, leader}
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

    test "a participant can invite a participant to their org" do
      {participant, org, _leader} = org_member("participant", "p1@invitations.test")

      assert {:ok, inv} =
               Invitations.create_invitation(participant, %{
                 "email" => "guest@example.com",
                 "organization_id" => org.id
               })

      assert inv.organization_id == org.id
      assert inv.role == "participant"
      assert inv.inviter_id == participant.id
    end

    test "a participant can invite scan-only staff to their org" do
      {participant, org, _leader} = org_member("participant", "p2@invitations.test")

      assert {:ok, inv} =
               Invitations.create_invitation(participant, %{
                 "email" => "scanner@example.com",
                 "organization_id" => org.id,
                 "role" => "staff"
               })

      assert inv.role == "staff"
    end

    test "a participant who manages exactly one org may omit organization_id" do
      {participant, org, _leader} = org_member("participant", "p3@invitations.test")

      assert {:ok, inv} = Invitations.create_invitation(participant, "guest2@example.com")
      assert inv.organization_id == org.id
    end

    test "a scan-only staff member cannot invite" do
      {staff, org, _leader} = org_member("staff", "s1@invitations.test")

      assert {:error, :forbidden} =
               Invitations.create_invitation(staff, %{
                 "email" => "nope@example.com",
                 "organization_id" => org.id
               })
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

    test "a participant sees invitations issued for their org by the leader" do
      {participant, org, leader} = org_member("participant", "p4@invitations.test")

      {:ok, by_leader} =
        Invitations.create_invitation(leader, %{
          "email" => "from-leader@example.com",
          "organization_id" => org.id
        })

      ids = participant |> Invitations.list_invitations() |> Enum.map(& &1.id)
      assert by_leader.id in ids
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

  describe "staff invitations" do
    test "leader can invite a scan-only staff member" do
      creator = creator_user()

      assert {:ok, inv} =
               Invitations.create_invitation(creator, %{
                 "email" => "scanner@example.com",
                 "role" => "staff"
               })

      assert inv.role == "staff"
    end

    test "rejects an unsupported invited role" do
      creator = creator_user()

      assert {:error, :invalid_role} =
               Invitations.create_invitation(creator, %{
                 "email" => "x@example.com",
                 "role" => "leader"
               })
    end

    test "accepting a staff invite creates a staff membership without promoting the user" do
      creator = creator_user()

      {:ok, inv} =
        Invitations.create_invitation(creator, %{
          "email" => "scan@example.com",
          "role" => "staff"
        })

      assert {:ok, %{user: user, organization: org}} = Invitations.accept_invitation(inv.token)
      assert user.role == "buyer"
      assert org.role == "staff"
      assert Backend.Organizations.member?(user.id, org.id)
      refute Backend.Organizations.can_manage?(user.id, org.id)
    end

    test "verify_code does not promote a staff invitee to creator" do
      creator = creator_user()

      {:ok, _} =
        Invitations.create_invitation(creator, %{
          "email" => "staffcode@example.com",
          "role" => "staff"
        })

      {:ok, code} = Accounts.request_code("staffcode@example.com")
      {:ok, %{user: user}} = Accounts.verify_code("staffcode@example.com", code)

      assert user.role == "buyer"
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
