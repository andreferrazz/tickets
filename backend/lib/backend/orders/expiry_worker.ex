defmodule Backend.Orders.ExpiryWorker do
  @moduledoc "Periodically expires pending orders older than the configured timeout."

  use GenServer

  @check_interval_ms :timer.minutes(5)
  # Release stock for orders that have been pending longer than this.
  @expiry_minutes 30

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @impl GenServer
  def init(state) do
    schedule()
    {:ok, state}
  end

  @impl GenServer
  def handle_info(:run, state) do
    expired_count = Backend.Orders.expire_stale_orders(@expiry_minutes)

    if expired_count > 0 do
      require Logger
      Logger.info("expired #{expired_count} pending orders")
    end

    schedule()
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :run, @check_interval_ms)
end
