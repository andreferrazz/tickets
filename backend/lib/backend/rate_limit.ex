defmodule Backend.RateLimit do
  @moduledoc """
  Fixed-window rate limiter backed by ETS.

  Each (key, window) pair tracks a request count. The window is derived by
  dividing the current Unix timestamp (seconds) by `window_seconds`, so
  windows reset at predictable boundaries rather than rolling.

  Usage:
      {:allow, 3} = Backend.RateLimit.check("ip:1.2.3.4", 60, 10)
      {:deny, 11} = Backend.RateLimit.check("ip:1.2.3.4", 60, 10)
  """

  use GenServer

  @table :rate_limit_counters

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  @impl GenServer
  def init(state) do
    :ets.new(@table, [
      :named_table,
      :public,
      :set,
      write_concurrency: true,
      read_concurrency: true
    ])

    {:ok, state}
  end

  @doc """
  Increments the counter for `key` in the current fixed window of `window_seconds`.

  Returns `{:allow, count}` if count <= `max_requests`, else `{:deny, count}`.
  """
  def check(key, window_seconds, max_requests) do
    window = div(System.os_time(:second), window_seconds)
    bucket = {key, window}
    count = :ets.update_counter(@table, bucket, {2, 1}, {bucket, 0})
    if count <= max_requests, do: {:allow, count}, else: {:deny, count}
  end
end
