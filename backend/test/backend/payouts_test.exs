defmodule Backend.PayoutsTest do
  use Backend.DataCase, async: false

  alias Backend.Accounts
  alias Backend.Events
  alias Backend.Orders
  alias Backend.Organizations
  alias Backend.Payouts
  alias Backend.Payouts.Payout

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp creator_user do
    email = "creator_#{:rand.uniform(999_999)}@payouts.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "creator"])
    user = Repo.get!(Accounts.User, user.id)
    {:ok, org} = Organizations.create_organization(%{name: "Org #{user.id}"})
    {:ok, _} = Organizations.add_member(org.id, user.id, "leader")
    %{user: user, org: org}
  end

  defp buyer_user do
    email = "buyer_#{:rand.uniform(999_999)}@payouts.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    user
  end

  defp admin_user do
    email = "admin_#{:rand.uniform(999_999)}@payouts.test"
    {:ok, code} = Accounts.request_code(email)
    {:ok, %{user: user}} = Accounts.verify_code(email, code)
    Repo.update_all(from(u in Accounts.User, where: u.id == ^user.id), set: [role: "admin"])
    Repo.get!(Accounts.User, user.id)
  end

  defp event_with_paid_order(creator_user, total_cents \\ 50_000) do
    {:ok, event} =
      Events.create_event(creator_user, %{
        "title" => "Show",
        "starts_at" => "2027-06-01T18:00:00Z",
        "status" => "published"
      })

    {:ok, tt} = Events.create_ticket_type(creator_user, event.id, %{"name" => "General"})

    {:ok, _b} =
      Events.create_batch(creator_user, tt.id, %{
        "price_cents" => total_cents,
        "quantity_total" => 10
      })

    buyer = buyer_user()

    {:ok, order} =
      Orders.create_order(buyer, event.id, [
        %{"item_type" => "ticket", "item_id" => tt.id, "quantity" => 1}
      ])

    {:ok, _} =
      Orders.mark_paid_by_checkout(order.abacate_checkout_id, %{payment_method: "PIX"})

    event
  end

  defp configure_pix(org) do
    {:ok, org} =
      Organizations.update_organization(%Accounts.User{role: "admin"}, org.id, %{"name" => org.name})

    {:ok, org} =
      Backend.Organizations.Organization.payout_settings_changeset(org, %{
        pix_key: "creator@example.com",
        pix_key_type: "email"
      })
      |> Repo.update()

    org
  end

  # ---------------------------------------------------------------------------
  # available_balance / list / last_payout_at
  # ---------------------------------------------------------------------------

  describe "available_balance/1" do
    test "equals net revenue when no payouts exist" do
      %{user: creator} = creator_user()
      event = event_with_paid_order(creator)
      assert Payouts.available_balance(event.id) == Events.net_revenue_cents(event.id)
    end

    test "subtracts pending and complete payouts but not failed/cancelled" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)
      net = Events.net_revenue_cents(event.id)

      {:ok, _p1} =
        insert_payout(event.id, creator.id, 10_000, "pending")

      {:ok, _p2} =
        insert_payout(event.id, creator.id, 5_000, "failed")

      assert Payouts.available_balance(event.id) == net - 10_000
    end
  end

  defp insert_payout(event_id, user_id, amount, status) do
    Payout.create_changeset(%{
      event_id: event_id,
      requested_by_id: user_id,
      amount_cents: amount,
      pix_key: "x@y.test",
      pix_key_type: "email",
      external_id: Ecto.UUID.generate(),
      status: status
    })
    |> Repo.insert()
  end

  # ---------------------------------------------------------------------------
  # create_payout/3
  # ---------------------------------------------------------------------------

  describe "create_payout/3" do
    test "happy path: persists pending row + calls Abacate" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)

      assert {:ok, payout} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 10_000})

      assert payout.amount_cents == 10_000
      assert payout.status == "pending"
      assert payout.abacate_payout_id =~ "pyt_test_"
      assert payout.pix_key == "creator@example.com"
      assert payout.pix_key_type == "email"
    end

    test "admin can withdraw on any org (bypasses leader check)" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)

      admin = admin_user()

      assert {:ok, payout} =
               Payouts.create_payout(admin, event.id, %{"amount_cents" => 1000})

      assert payout.status == "pending"
      assert payout.requested_by_id == admin.id
    end

    test "non-leader (participant) is forbidden" do
      %{user: leader, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(leader)

      participant = buyer_user()
      {:ok, _} = Organizations.add_member(org.id, participant.id, "participant")

      assert {:error, :forbidden} =
               Payouts.create_payout(participant, event.id, %{"amount_cents" => 1000})
    end

    test "pix_key_missing when org hasn't configured one" do
      %{user: creator} = creator_user()
      event = event_with_paid_order(creator)

      assert {:error, :pix_key_missing} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 1000})
    end

    test "invalid_amount for zero, negative, or > 500_000" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)

      assert {:error, :invalid_amount} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 0})

      assert {:error, :invalid_amount} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => -1})

      assert {:error, :invalid_amount} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 500_001})
    end

    test "insufficient_balance when amount exceeds net revenue" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator, 1_000)

      assert {:error, :insufficient_balance} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 500_000})
    end

    test "rate_limited when a non-failed payout exists in last 24h" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)

      {:ok, _} = Payouts.create_payout(creator, event.id, %{"amount_cents" => 1000})

      assert {:error, :rate_limited} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 1000})
    end

    test "a failed Abacate response stores a failed row but does not block retries" do
      %{user: creator, org: org} = creator_user()
      configure_pix(org)
      event = event_with_paid_order(creator)

      Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayFailingMock)
      on_exit(fn -> Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayMock) end)

      assert {:error, :abacate_unavailable} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 1000})

      # The failed row was persisted with status "failed"
      assert [%Payout{status: "failed", error_message: msg}] = Payouts.list_payouts(event.id)
      assert is_binary(msg)

      # Switch back to the default mock and confirm the rate-limit guard isn't
      # tripped by the failed row.
      Application.put_env(:backend, :abacate_pay_module, Backend.AbacatePayMock)

      assert {:ok, _payout} =
               Payouts.create_payout(creator, event.id, %{"amount_cents" => 1000})
    end
  end
end
