defmodule Backend.Payouts do
  @moduledoc """
  Per-event withdrawals to a PIX destination via Abacate Pay.

  Funds belong to the event's organisation, so the destination key lives on
  `Backend.Organizations.Organization` and only the org's `leader` (or a
  global admin) can request a withdrawal. Pending and completed payouts both
  deduct from the available balance; `failed` and `cancelled` rows do not,
  which is also why the 24h rate-limit query excludes those statuses (a
  failed attempt should not trap the user for a day).
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Events
  alias Backend.Events.Event
  alias Backend.Organizations
  alias Backend.Organizations.Organization
  alias Backend.Payouts.Payout

  @rate_limit_window_seconds 24 * 60 * 60
  @blocking_statuses ~w(pending complete refunded expired)

  @doc """
  Net revenue of `event_id` minus the sum of non-failed payout amounts.
  Returns a non-negative integer (cents).
  """
  def available_balance(event_id) when is_binary(event_id) do
    net = Events.net_revenue_cents(event_id)
    max(0, net - deducted_cents(event_id))
  end

  @doc "Sum of amount_cents for payouts that are still holding funds (i.e. not failed/cancelled)."
  def deducted_cents(event_id) when is_binary(event_id) do
    Repo.one(
      from p in Payout,
        where: p.event_id == ^event_id and p.status in @blocking_statuses,
        select: coalesce(sum(p.amount_cents), 0)
    ) || 0
  end

  @doc "Most recent payout `inserted_at` for `event_id`, or nil."
  def last_payout_at(event_id) when is_binary(event_id) do
    Repo.one(
      from p in Payout,
        where: p.event_id == ^event_id and p.status in @blocking_statuses,
        order_by: [desc: p.inserted_at],
        limit: 1,
        select: p.inserted_at
    )
  end

  @doc "Last 10 payout rows for `event_id`, newest first."
  def list_payouts(event_id, limit \\ 10) when is_binary(event_id) do
    Repo.all(
      from p in Payout,
        where: p.event_id == ^event_id,
        order_by: [desc: p.inserted_at],
        limit: ^limit
    )
  end

  @doc """
  Creates a payout for `event_id` on behalf of `user`. See module docs for
  authorisation and rate-limit rules. Returns `{:ok, payout}` or
  `{:error, reason}` where reason is one of:

    * `:not_found` — event missing or soft-deleted
    * `:forbidden` — user isn't a leader/admin of the event's org
    * `:pix_key_missing` — org hasn't configured a PIX destination
    * `:invalid_amount` — amount not in `1..#{500_000}`
    * `:insufficient_balance` — amount exceeds available balance
    * `:rate_limited` — a non-failed payout exists within the last 24h
    * `{:upstream, ...}` / `{:transport, ...}` — Abacate-side failure
      (the payout row is still persisted with status "failed")
  """
  def create_payout(user, event_id, %{"amount_cents" => amount})
      when is_binary(event_id) do
    with {:ok, event} <- fetch_event(event_id),
         {:ok, org} <- authorize_leader(user, event),
         :ok <- check_pix_key(org),
         :ok <- check_amount(amount),
         :ok <- check_balance(event.id, amount),
         :ok <- check_rate_limit(event.id) do
      perform_payout(event, org, user, amount)
    end
  end

  def create_payout(_user, _event_id, _attrs), do: {:error, :invalid_amount}

  defp fetch_event(event_id) do
    case Repo.get(Event, event_id) do
      nil -> {:error, :not_found}
      %Event{deleted_at: %DateTime{}} -> {:error, :not_found}
      event -> {:ok, event}
    end
  end

  defp authorize_leader(%{role: "admin"} = _user, event) do
    {:ok, Repo.get!(Organization, event.organization_id)}
  end

  defp authorize_leader(user, event) do
    if Organizations.leader?(user.id, event.organization_id) do
      {:ok, Repo.get!(Organization, event.organization_id)}
    else
      {:error, :forbidden}
    end
  end

  defp check_pix_key(%Organization{pix_key: key, pix_key_type: type})
       when is_binary(key) and is_binary(type),
       do: :ok

  defp check_pix_key(_), do: {:error, :pix_key_missing}

  defp check_amount(amount)
       when is_integer(amount) and amount > 0 and amount <= 500_000,
       do: :ok

  defp check_amount(_), do: {:error, :invalid_amount}

  defp check_balance(event_id, amount) do
    if amount <= available_balance(event_id),
      do: :ok,
      else: {:error, :insufficient_balance}
  end

  defp check_rate_limit(event_id) do
    cutoff = DateTime.utc_now() |> DateTime.add(-@rate_limit_window_seconds, :second)

    exists =
      Repo.exists?(
        from p in Payout,
          where:
            p.event_id == ^event_id and p.status in @blocking_statuses and
              p.inserted_at > ^cutoff
      )

    if exists, do: {:error, :rate_limited}, else: :ok
  end

  defp perform_payout(event, org, user, amount) do
    external_id = Ecto.UUID.generate()

    {:ok, payout} =
      %{
        event_id: event.id,
        requested_by_id: user.id,
        amount_cents: amount,
        pix_key: org.pix_key,
        pix_key_type: org.pix_key_type,
        external_id: external_id,
        status: "pending"
      }
      |> Payout.create_changeset()
      |> Repo.insert()

    case abacate_pay().create_payout(
           amount,
           external_id,
           "Saque do evento #{event.id}",
           org.pix_key,
           org.pix_key_type
         ) do
      {:ok, %{id: id, status: status, receipt_url: url}} ->
        payout
        |> Payout.settle_changeset(%{
          abacate_payout_id: id,
          status: status,
          receipt_url: url
        })
        |> Repo.update()

      {:error, reason} ->
        payout
        |> Payout.settle_changeset(%{status: "failed", error_message: inspect(reason)})
        |> Repo.update()

        {:error, reason}
    end
  end

  defp abacate_pay do
    Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)
  end
end
