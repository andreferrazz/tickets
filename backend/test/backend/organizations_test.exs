defmodule Backend.OrganizationsTest do
  use Backend.DataCase, async: true

  alias Backend.{Accounts, Events, Organizations}

  defp user_with_role(role, prefix) do
    email = "#{prefix}_#{:rand.uniform(999_999)}@orgs.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)

    if role != "buyer" do
      Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: role])
    end

    Repo.get!(Accounts.User, user.id)
  end

  defp leader_with_org(prefix \\ "leader") do
    user = user_with_role("creator", prefix)
    {:ok, org} = Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Organizations.add_member(org.id, user.id, "leader")
    {user, org}
  end

  defp event_in(creator, org, opts \\ []) do
    {:ok, event} =
      Events.create_event(creator, %{
        "title" => Keyword.get(opts, :title, "Test"),
        "starts_at" => "2027-01-01T10:00:00Z",
        "status" => Keyword.get(opts, :status, "published"),
        "organization_id" => org.id
      })

    event
  end

  # ---------------------------------------------------------------------------
  # Memberships
  # ---------------------------------------------------------------------------

  describe "add_member/3" do
    test "adds a participant" do
      {leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")

      assert {:ok, m} = Organizations.add_member(org.id, participant.id, "participant")
      assert m.role == "participant"
      assert Organizations.member?(participant.id, org.id)
      refute Organizations.leader?(participant.id, org.id)
      assert Organizations.leader?(leader.id, org.id)
    end

    test "rejects a second leader for the same org" do
      {_leader, org} = leader_with_org()
      other = user_with_role("creator", "p")
      assert {:error, :leader_exists} = Organizations.add_member(org.id, other.id, "leader")
    end

    test "rejects a duplicate membership for the same user" do
      {leader, org} = leader_with_org()

      assert {:error, :already_member} =
               Organizations.add_member(org.id, leader.id, "participant")
    end
  end

  describe "transfer_leadership/3" do
    test "swaps leader and participant atomically" do
      {leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:ok, :ok} = Organizations.transfer_leadership(org.id, leader.id, participant.id)

      assert Organizations.leader?(participant.id, org.id)
      refute Organizations.leader?(leader.id, org.id)
      assert Organizations.member?(leader.id, org.id)
    end

    test "rejects when source isn't the leader" do
      {leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:error, :not_leader} =
               Organizations.transfer_leadership(org.id, participant.id, leader.id)
    end
  end

  describe "list_for_user/1" do
    test "returns every org the user belongs to" do
      {user, org1} = leader_with_org("multi")
      {:ok, org2} = Organizations.create_organization(%{name: "Second"})
      {:ok, _} = Organizations.add_member(org2.id, user.id, "participant")

      ids = user.id |> Organizations.list_for_user() |> Enum.map(& &1.id) |> Enum.sort()
      assert ids == Enum.sort([org1.id, org2.id])
    end
  end

  # ---------------------------------------------------------------------------
  # Deletion
  # ---------------------------------------------------------------------------

  describe "update_organization/3" do
    test "leader can rename their org" do
      {leader, org} = leader_with_org()

      assert {:ok, renamed} =
               Organizations.update_organization(leader, org.id, %{"name" => "New"})

      assert renamed.name == "New"
    end

    test "participant cannot rename" do
      {_leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:error, :forbidden} =
               Organizations.update_organization(participant, org.id, %{"name" => "Nope"})
    end

    test "admin can rename any org" do
      {_leader, org} = leader_with_org()
      admin = user_with_role("admin", "adm")

      assert {:ok, renamed} =
               Organizations.update_organization(admin, org.id, %{"name" => "By Admin"})

      assert renamed.name == "By Admin"
    end

    test "rejects blank name with a changeset error" do
      {leader, org} = leader_with_org()

      assert {:error, %Ecto.Changeset{}} =
               Organizations.update_organization(leader, org.id, %{"name" => ""})
    end
  end

  describe "delete_organization/2" do
    test "leader deletes an empty org" do
      {leader, org} = leader_with_org()
      assert {:ok, _} = Organizations.delete_organization(leader, org.id)
      assert Organizations.get_organization(org.id) == nil
    end

    test "refuses when the org has active events" do
      {leader, org} = leader_with_org()
      _event = event_in(leader, org)

      assert {:error, :has_active_events} =
               Organizations.delete_organization(leader, org.id)
    end

    test "still refuses after events are soft-deleted (audit rows remain)" do
      {leader, org} = leader_with_org()
      event = event_in(leader, org)
      {:ok, _} = Events.delete_event(leader, event.id)

      assert {:error, :has_active_events} =
               Organizations.delete_organization(leader, org.id)
    end

    test "participant cannot delete the org" do
      {_leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:error, :forbidden} = Organizations.delete_organization(participant, org.id)
    end

    test "admin can delete any org" do
      {_leader, org} = leader_with_org()
      admin = user_with_role("admin", "adm")
      assert {:ok, _} = Organizations.delete_organization(admin, org.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Cross-org behaviors via Events context
  # ---------------------------------------------------------------------------

  describe "participants share write access with the leader" do
    test "participant can create an event in the org" do
      {_leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:ok, event} =
               Events.create_event(participant, %{
                 "title" => "Participant Fest",
                 "starts_at" => "2027-01-01T10:00:00Z",
                 "organization_id" => org.id
               })

      assert event.organization_id == org.id
      assert event.created_by_id == participant.id
    end

    test "leader can edit an event the participant created" do
      {leader, org} = leader_with_org()
      participant = user_with_role("creator", "p")
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      event = event_in(participant, org, title: "Original")
      assert {:ok, edited} = Events.update_event(leader, event.id, %{"title" => "Renamed"})
      assert edited.title == "Renamed"
    end

    test "non-member cannot edit an org's event" do
      {leader, org} = leader_with_org()
      outsider = user_with_role("creator", "out")
      {:ok, _outsider_org} = Organizations.create_organization(%{name: "Other"})
      event = event_in(leader, org)

      assert {:error, :forbidden} =
               Events.update_event(outsider, event.id, %{"title" => "Hack"})
    end
  end

  describe "create_event/2 organization resolution" do
    test "admin must pass organization_id explicitly" do
      admin = user_with_role("admin", "adm")

      assert {:error, :organization_id_required} =
               Events.create_event(admin, %{
                 "title" => "X",
                 "starts_at" => "2027-01-01T10:00:00Z"
               })
    end

    test "admin with explicit organization_id succeeds even without membership" do
      admin = user_with_role("admin", "adm")
      {:ok, org} = Organizations.create_organization(%{name: "AdminTarget"})

      assert {:ok, event} =
               Events.create_event(admin, %{
                 "title" => "AdminEvent",
                 "starts_at" => "2027-01-01T10:00:00Z",
                 "organization_id" => org.id
               })

      assert event.organization_id == org.id
      assert event.created_by_id == admin.id
    end

    test "creator with explicit organization_id they don't belong to gets :forbidden" do
      {_leader, foreign_org} = leader_with_org("foreign")
      outsider = user_with_role("creator", "out")

      assert {:error, :forbidden} =
               Events.create_event(outsider, %{
                 "title" => "X",
                 "starts_at" => "2027-01-01T10:00:00Z",
                 "organization_id" => foreign_org.id
               })
    end

    test "creator in multiple orgs without organization_id gets :organization_id_required" do
      {user, org1} = leader_with_org("multi2")
      {:ok, org2} = Organizations.create_organization(%{name: "Second"})
      {:ok, _} = Organizations.add_member(org2.id, user.id, "participant")
      _ = org1

      assert {:error, :organization_id_required} =
               Events.create_event(user, %{
                 "title" => "X",
                 "starts_at" => "2027-01-01T10:00:00Z"
               })
    end
  end

  describe "list_events visibility across orgs" do
    test "member sees drafts from every org they belong to" do
      {user, org1} = leader_with_org("multi3")
      {:ok, org2} = Organizations.create_organization(%{name: "Second"})
      {:ok, _} = Organizations.add_member(org2.id, user.id, "participant")

      event_in(user, org1, status: "draft", title: "Org1Draft")
      event_in(user, org2, status: "draft", title: "Org2Draft")

      titles = user |> Events.list_events() |> Enum.map(& &1.title)
      assert "Org1Draft" in titles
      assert "Org2Draft" in titles
    end
  end
end
