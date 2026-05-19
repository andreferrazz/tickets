defmodule Backend.Orders.ExpiryWorker do
  @moduledoc """
  Reconciles pending orders with Abacate Pay every 10 minutes.

  For each order pending longer than `@min_pending_minutes`, asks Abacate
  Pay for the checkout's current status:

    * `paid`     — webhook fallback: marks the order paid and fulfils it
                   (issues passes, sends email). Recovers from missed or
                   delayed `checkout.completed` webhooks.
    * `cancelled`/`expired`/`refunded` — terminal upstream state: mirrors
                   it locally and releases stock.
    * `pending`  — still open upstream. Expires the order locally anyway,
                   matching the prior time-based sweep. Abacate Pay has no
                   checkout-cancel endpoint, so the upstream checkout stays
                   open until their own expiry kicks in; a late payment
                   would arrive via webhook and `mark_paid_by_checkout/2`
                   would still flip the order to paid.

  Errors from Abacate Pay are logged and skipped — the next cycle retries.
  Never expiring on an upstream failure is intentional: that was the bug
  this worker exists to prevent.
  """

  use GenServer
  require Logger

  @check_interval_ms :timer.minutes(10)
  # Give buyers time to complete checkout before we poke Abacate Pay.
  @min_pending_minutes 15

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @impl GenServer
  def init(state) do
    schedule()
    {:ok, state}
  end

  @impl GenServer
  def handle_info(:run, state) do
    Backend.Orders.list_stale_pending_orders(@min_pending_minutes)
    |> Enum.each(&reconcile/1)

    schedule()
    {:noreply, state}
  end

  # Free orders and orders that never got an Abacate Pay checkout: there's
  # no upstream state to consult, so fall back to time-based expiry.
  defp reconcile(%{abacate_checkout_id: nil} = order) do
    Backend.Orders.mark_expired(order)
  end

  defp reconcile(order) do
    case abacate_pay().get_checkout(order.abacate_checkout_id) do
      {:ok, %{status: "paid"} = info} ->
        recover_paid_order(order, info)

      {:ok, %{status: status}} when status in ~w(cancelled expired refunded) ->
        Backend.Orders.mark_expired(order)

      {:ok, %{status: "pending"}} ->
        Backend.Orders.mark_expired(order)

      {:error, reason} ->
        Logger.warning(
          "expiry_worker: get_checkout failed for order=#{order.id} checkout=#{order.abacate_checkout_id}: #{inspect(reason)}"
        )
    end
  end

  defp recover_paid_order(order, info) do
    with {:ok, paid} <-
           Backend.Orders.mark_paid_by_checkout(order.abacate_checkout_id, info),
         {:ok, _order, _passes} <- Backend.Orders.fulfill_paid_order(paid) do
      Logger.info(
        "expiry_worker: recovered missed payment for order=#{order.id} checkout=#{order.abacate_checkout_id}"
      )
    else
      {:error, reason} ->
        Logger.warning(
          "expiry_worker: recover_paid failed for order=#{order.id}: #{inspect(reason)}"
        )
    end
  end

  defp abacate_pay,
    do: Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)

  defp schedule, do: Process.send_after(self(), :run, @check_interval_ms)
end
