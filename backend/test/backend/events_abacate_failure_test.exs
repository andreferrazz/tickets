defmodule Backend.EventsAbacateFailureTest do
  # async: false because we swap the global :abacate_pay_module env to a
  # failing stub; other suites read the same env and would race.
  use Backend.DataCase, async: false

  alias Backend.Accounts
  alias Backend.Events
  alias Backend.Events.{ExtraItem, TicketBatch}

  setup do
    original = Application.get_env(:backend, :abacate_pay_module)
    Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayFailingMock)
    on_exit(fn -> Application.put_env(:backend, :abacate_pay_module, original) end)
    :ok
  end

  defp creator_user do
    email = "creator_fail_#{:rand.uniform(999_999)}@events.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    user = Repo.get!(Accounts.User, user.id)
    {:ok, org} = Backend.Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Backend.Organizations.add_member(org.id, user.id, "leader")
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

  describe "when Abacate Pay create_product fails" do
    test "create_extra/3 rolls back and persists no row" do
      user = creator_user()
      event = published_event(user)

      assert {:error, :abacate_unavailable} =
               Events.create_extra(user, event.id, %{"name" => "Hat", "price_cents" => 500})

      assert Repo.aggregate(from(ex in ExtraItem, where: ex.event_id == ^event.id), :count) == 0
    end

    test "create_batch/3 rolls back and persists no batch row" do
      user = creator_user()
      event = published_event(user)

      # create_ticket_type no longer talks to Abacate; only batches do. We need
      # a real ticket type first since batches belong to one.
      original = Application.get_env(:backend, :abacate_pay_module)
      Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayMock)
      {:ok, tt} = Events.create_ticket_type(user, event.id, %{"name" => "VIP"})
      Application.put_env(:backend, :abacate_pay_module, original)

      assert {:error, :abacate_unavailable} =
               Events.create_batch(user, tt.id, %{
                 "price_cents" => 9999,
                 "quantity_total" => 10
               })

      assert Repo.aggregate(
               from(b in TicketBatch, where: b.ticket_type_id == ^tt.id),
               :count
             ) == 0
    end
  end
end
