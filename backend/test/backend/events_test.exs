defmodule Backend.EventsTest do
  use Backend.DataCase, async: true

  alias Backend.Accounts
  alias Backend.Events
  alias Backend.Events.{Event, ExtraItem, TicketType}

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp creator_user do
    email = "creator_#{:rand.uniform(999_999)}@events.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    Repo.get!(Accounts.User, user.id)
  end

  defp buyer_user do
    email = "buyer_#{:rand.uniform(999_999)}@events.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp published_event(user) do
    {:ok, event} =
      Events.create_event(user, %{
        "title" => "Test Event",
        "starts_at" => "2027-01-01T10:00:00Z",
        "status" => "published"
      })

    event
  end

  # ---------------------------------------------------------------------------
  # Events CRUD
  # ---------------------------------------------------------------------------

  describe "create_event/2" do
    test "creates a draft event for a creator" do
      user = creator_user()

      assert {:ok, event} =
               Events.create_event(user, %{
                 "title" => "My Fest",
                 "starts_at" => "2027-06-01T18:00:00Z"
               })

      assert event.title == "My Fest"
      assert event.status == "draft"
      assert event.creator_id == user.id
    end

    test "returns error when title is missing" do
      user = creator_user()

      assert {:error, changeset} =
               Events.create_event(user, %{"starts_at" => "2027-01-01T00:00:00Z"})

      assert %{title: _} = errors_on(changeset)
    end
  end

  describe "list_events/0" do
    test "returns only published events" do
      user = creator_user()
      published_event(user)
      Events.create_event(user, %{"title" => "Draft", "starts_at" => "2027-01-01T00:00:00Z"})

      events = Events.list_events()
      assert Enum.all?(events, &(&1.status == "published"))
    end
  end

  describe "get_event/1" do
    test "returns event with preloaded associations" do
      user = creator_user()
      event = published_event(user)

      {:ok, _tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "VIP",
          "price_cents" => 5000,
          "quantity_total" => 100
        })

      found = Events.get_event(event.id)
      assert found.id == event.id
      assert [%TicketType{name: "VIP"}] = found.ticket_types
      assert found.extras == []
    end

    test "returns nil for unknown id" do
      assert nil == Events.get_event(Ecto.UUID.generate())
    end
  end

  describe "update_event/3" do
    test "owner can update their event" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, updated} = Events.update_event(user, event.id, %{"title" => "New Name"})
      assert updated.title == "New Name"
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      assert {:error, :forbidden} = Events.update_event(other, event.id, %{"title" => "Hack"})
    end

    test "unknown event returns not_found" do
      user = creator_user()
      assert {:error, :not_found} = Events.update_event(user, Ecto.UUID.generate(), %{})
    end
  end

  describe "delete_event/2" do
    test "owner can soft-delete their event" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, _} = Events.delete_event(user, event.id)

      # row still exists but is invisible to context reads
      row = Repo.get!(Event, event.id)
      refute is_nil(row.deleted_at)
      assert nil == Events.get_event(event.id)
    end

    test "cascades deleted_at to ticket types and extras" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "GA",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      {:ok, ex} = Events.create_extra(user, event.id, %{"name" => "Cap", "price_cents" => 200})

      assert {:ok, _} = Events.delete_event(user, event.id)

      assert %TicketType{deleted_at: tt_at} = Repo.get!(TicketType, tt.id)
      assert %ExtraItem{deleted_at: ex_at} = Repo.get!(ExtraItem, ex.id)
      refute is_nil(tt_at)
      refute is_nil(ex_at)
    end

    test "cascade preserves an already-soft-deleted child's timestamp" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "Early",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      assert {:ok, _} = Events.delete_ticket_type(user, tt.id)
      original = Repo.get!(TicketType, tt.id).deleted_at

      assert {:ok, _} = Events.delete_event(user, event.id)
      assert Repo.get!(TicketType, tt.id).deleted_at == original
    end

    test "non-owner gets forbidden" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)
      assert {:error, :forbidden} = Events.delete_event(other, event.id)
    end

    test "already-deleted event returns not_found" do
      user = creator_user()
      event = published_event(user)
      assert {:ok, _} = Events.delete_event(user, event.id)
      assert {:error, :not_found} = Events.delete_event(user, event.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Ticket types
  # ---------------------------------------------------------------------------

  describe "create_ticket_type/3" do
    test "adds a ticket type to the owner's event" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, tt} =
               Events.create_ticket_type(user, event.id, %{
                 "name" => "General",
                 "price_cents" => 2000,
                 "quantity_total" => 200
               })

      assert tt.event_id == event.id
      assert tt.quantity_sold == 0
    end

    test "returns forbidden for non-owner" do
      creator = creator_user()
      other = buyer_user()
      event = published_event(creator)

      assert {:error, :forbidden} =
               Events.create_ticket_type(other, event.id, %{
                 "name" => "Hack",
                 "price_cents" => 0,
                 "quantity_total" => 1
               })
    end
  end

  describe "delete_ticket_type/2" do
    test "owner soft-deletes their ticket type" do
      user = creator_user()
      event = published_event(user)

      {:ok, tt} =
        Events.create_ticket_type(user, event.id, %{
          "name" => "A",
          "price_cents" => 100,
          "quantity_total" => 10
        })

      assert {:ok, _} = Events.delete_ticket_type(user, tt.id)

      row = Repo.get!(TicketType, tt.id)
      refute is_nil(row.deleted_at)
      # absent from the event's preloaded ticket_types
      reloaded = Events.get_event(event.id)
      assert Enum.empty?(reloaded.ticket_types)
    end
  end

  # ---------------------------------------------------------------------------
  # Extra items
  # ---------------------------------------------------------------------------

  describe "create_extra/3" do
    test "adds an extra to the owner's event" do
      user = creator_user()
      event = published_event(user)

      assert {:ok, extra} =
               Events.create_extra(user, event.id, %{
                 "name" => "T-Shirt",
                 "price_cents" => 3500
               })

      assert extra.event_id == event.id
      assert is_nil(extra.quantity_total)
    end
  end

  describe "delete_extra/2" do
    test "owner soft-deletes their extra item" do
      user = creator_user()
      event = published_event(user)
      {:ok, extra} = Events.create_extra(user, event.id, %{"name" => "Hat", "price_cents" => 500})
      assert {:ok, _} = Events.delete_extra(user, extra.id)

      row = Repo.get!(ExtraItem, extra.id)
      refute is_nil(row.deleted_at)
      reloaded = Events.get_event(event.id)
      assert Enum.empty?(reloaded.extras)
    end
  end
end
