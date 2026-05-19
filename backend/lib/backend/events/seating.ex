defmodule Backend.Events.Seating do
  @moduledoc """
  Seat-selection domain: rounded tables per event, sparse seat assignments
  bound to orders, and helpers used by the buyer page (availability) and
  order creation (atomic reservation + validation).
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Events.{Event, SeatAssignment, SeatTable}

  # ---------------------------------------------------------------------------
  # Tables (creator CRUD)
  # ---------------------------------------------------------------------------

  @doc "Lists live tables for `event_id`, ordered by position."
  def list_tables(event_id) do
    Repo.all(
      from t in SeatTable,
        where: t.event_id == ^event_id and is_nil(t.deleted_at),
        order_by: [asc: t.position, asc: t.inserted_at]
    )
  end

  @doc "Creates a new table on `event_id`. Caller must already own the event."
  def create_table(event_id, attrs) do
    next_pos = next_table_position(event_id)

    attrs
    |> normalize_string_keys()
    |> Map.put("event_id", event_id)
    |> Map.put_new("position", next_pos)
    |> SeatTable.changeset()
    |> Repo.insert()
  end

  defp next_table_position(event_id) do
    current =
      Repo.one(
        from t in SeatTable,
          where: t.event_id == ^event_id and is_nil(t.deleted_at),
          select: max(t.position)
      )

    (current || -1) + 1
  end

  @doc "Updates `table`'s name/position."
  def update_table(%SeatTable{} = table, attrs) do
    table
    |> SeatTable.update_changeset(normalize_string_keys(attrs))
    |> Repo.update()
  end

  @doc """
  Soft-deletes `table`. Refuses with `{:error, :table_has_assignments}` if any
  active seat is still claimed — the creator must release/refund those orders
  first.
  """
  def delete_table(%SeatTable{} = table) do
    if table_has_active_assignments?(table.id) do
      {:error, :table_has_assignments}
    else
      table
      |> Ecto.Changeset.change(deleted_at: DateTime.utc_now())
      |> Repo.update()
    end
  end

  defp table_has_active_assignments?(table_id) do
    Repo.exists?(
      from a in SeatAssignment,
        where: a.seat_table_id == ^table_id and is_nil(a.released_at)
    )
  end

  @doc "Returns `{:ok, table}` if found and live, or `{:error, :not_found}`."
  def fetch_table(id) do
    case Repo.one(from t in SeatTable, where: t.id == ^id and is_nil(t.deleted_at)) do
      nil -> {:error, :not_found}
      table -> {:ok, table}
    end
  end

  # ---------------------------------------------------------------------------
  # Availability (buyer-facing)
  # ---------------------------------------------------------------------------

  @doc """
  Returns `%{table_id => [seat_number]}` for every seat currently claimed on
  `event_id`. Seats with `released_at IS NOT NULL` are excluded — they are
  available again.
  """
  def taken_seats_by_table(event_id) do
    Repo.all(
      from a in SeatAssignment,
        where: a.event_id == ^event_id and is_nil(a.released_at),
        select: {a.seat_table_id, a.seat_number}
    )
    |> Enum.group_by(fn {table_id, _} -> table_id end, fn {_, n} -> n end)
  end

  @doc """
  Snapshot used by `GET /events/:id/seating` and embedded in `events/:id`.
  Returns `%{seats_per_table, tables: [%{id, name, position, taken_seats}]}`
  or `nil` when seat selection is disabled.
  """
  def seating_snapshot(%Event{seat_selection_enabled: false}), do: nil

  def seating_snapshot(%Event{seat_selection_enabled: true, id: event_id} = event) do
    taken = taken_seats_by_table(event_id)
    tables = list_tables(event_id)

    %{
      seats_per_table: event.seats_per_table,
      tables:
        Enum.map(tables, fn t ->
          %{
            id: t.id,
            name: t.name,
            position: t.position,
            taken_seats: Map.get(taken, t.id, []) |> Enum.sort()
          }
        end)
    }
  end

  # ---------------------------------------------------------------------------
  # Reservation (called by Backend.Orders.create_order/3)
  # ---------------------------------------------------------------------------

  @doc """
  Validates a buyer's seat picks against `event` and the cart's ticket
  quantity. Pure check — does not touch the database for reservations.

  Returns the normalized list (string-keyed maps) or `{:error, reason}`.
  """
  def validate_picks(%Event{seat_selection_enabled: false}, _picks, _ticket_count),
    do: {:ok, []}

  def validate_picks(%Event{seat_selection_enabled: true} = event, picks, ticket_count) do
    with :ok <- ensure_count_matches(picks, ticket_count),
         {:ok, normalized} <- normalize_picks(picks),
         :ok <- ensure_unique(normalized),
         :ok <- ensure_within_range(normalized, event.seats_per_table),
         :ok <- ensure_tables_belong_to_event(normalized, event.id) do
      {:ok, normalized}
    end
  end

  defp ensure_count_matches(picks, ticket_count) do
    if length(picks) == ticket_count,
      do: :ok,
      else: {:error, {:seat_count_mismatch, length(picks), ticket_count}}
  end

  defp normalize_picks(picks) when is_list(picks) do
    Enum.reduce_while(picks, {:ok, []}, fn pick, {:ok, acc} ->
      case normalize_pick(pick) do
        {:ok, n} -> {:cont, {:ok, acc ++ [n]}}
        err -> {:halt, err}
      end
    end)
  end

  defp normalize_picks(_), do: {:error, {:invalid_seat_pick, "expected list"}}

  defp normalize_pick(%{"seat_table_id" => t, "seat_number" => n})
       when is_binary(t) and is_integer(n),
       do: {:ok, %{seat_table_id: t, seat_number: n}}

  defp normalize_pick(%{seat_table_id: t, seat_number: n})
       when is_binary(t) and is_integer(n),
       do: {:ok, %{seat_table_id: t, seat_number: n}}

  defp normalize_pick(pick), do: {:error, {:invalid_seat_pick, inspect(pick)}}

  defp ensure_unique(picks) do
    keys = Enum.map(picks, &{&1.seat_table_id, &1.seat_number})

    if length(Enum.uniq(keys)) == length(keys),
      do: :ok,
      else: {:error, {:invalid_seat_pick, "duplicate seats in payload"}}
  end

  defp ensure_within_range(picks, seats_per_table) do
    bad = Enum.find(picks, &(&1.seat_number < 1 or &1.seat_number > seats_per_table))

    case bad do
      nil -> :ok
      pick -> {:error, {:invalid_seat_pick, "seat #{pick.seat_number} out of range"}}
    end
  end

  defp ensure_tables_belong_to_event(picks, event_id) do
    table_ids = picks |> Enum.map(& &1.seat_table_id) |> Enum.uniq()

    valid_ids =
      Repo.all(
        from t in SeatTable,
          where: t.id in ^table_ids and t.event_id == ^event_id and is_nil(t.deleted_at),
          select: t.id
      )
      |> MapSet.new()

    unknown = Enum.find(table_ids, &(not MapSet.member?(valid_ids, &1)))

    case unknown do
      nil -> :ok
      id -> {:error, {:invalid_seat_pick, "unknown table #{id}"}}
    end
  end

  @doc """
  Inserts seat assignments inside the caller's transaction. Each pick is mapped
  to a ticket `order_item` in order (first ticket-item consumes the first N
  picks where N = its quantity).

  Raises `Postgrex.Error` with constraint name `seat_assignments_active_uniq`
  on a race; callers rescue and convert to `{:error, {:seat_taken, ...}}`.
  """
  def reserve!(event, picks, order, ticket_items) do
    rows = build_assignment_rows(event, picks, order, ticket_items)

    Repo.insert_all(SeatAssignment, rows)
  end

  defp build_assignment_rows(_event, [], _order, _items), do: []

  defp build_assignment_rows(event, picks, order, ticket_items) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    pairs = pair_picks_to_items(picks, ticket_items)

    Enum.map(pairs, fn {pick, item} ->
      %{
        id: Ecto.UUID.generate(),
        event_id: event.id,
        seat_table_id: pick.seat_table_id,
        seat_number: pick.seat_number,
        order_id: order.id,
        order_item_id: item.id,
        inserted_at: now,
        updated_at: now
      }
    end)
  end

  # Greedy 1:1: walk ticket items in input order, attaching `quantity` picks
  # to each before moving on. Guarantees every pick gets an order_item_id and
  # every ticket pass has a matching assignment to pair with later.
  defp pair_picks_to_items(picks, ticket_items) do
    {pairs, _} =
      Enum.reduce(ticket_items, {[], picks}, fn item, {acc, remaining} ->
        {chunk, rest} = Enum.split(remaining, item.quantity)
        {acc ++ Enum.map(chunk, &{&1, item}), rest}
      end)

    pairs
  end

  # ---------------------------------------------------------------------------
  # Release (called by Backend.Orders on cancel / expire / refund)
  # ---------------------------------------------------------------------------

  @doc "Marks all of `order_id`'s active assignments as released."
  def release_for_order(order_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    {count, _} =
      Repo.update_all(
        from(a in SeatAssignment,
          where: a.order_id == ^order_id and is_nil(a.released_at)
        ),
        set: [released_at: now]
      )

    count
  end

  # ---------------------------------------------------------------------------
  # Lookup for pass issuance
  # ---------------------------------------------------------------------------

  @doc """
  Returns the active assignments for `order_id` preloaded with their table,
  ordered by (table.position, seat_number) so callers can deterministically
  pair them with passes.
  """
  def list_for_pass_issuance(order_id) do
    Repo.all(
      from a in SeatAssignment,
        join: t in SeatTable,
        on: a.seat_table_id == t.id,
        where: a.order_id == ^order_id and is_nil(a.released_at),
        order_by: [asc: a.order_item_id, asc: t.position, asc: a.seat_number],
        preload: [seat_table: t]
    )
  end

  @doc "Updates `assignment` to point at the freshly-issued `pass_id`."
  def set_pass_id(%SeatAssignment{} = a, pass_id) do
    a
    |> Ecto.Changeset.change(pass_id: pass_id)
    |> Repo.update!()
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp normalize_string_keys(attrs) when is_map(attrs) do
    Enum.into(attrs, %{}, fn
      {k, v} when is_atom(k) -> {Atom.to_string(k), v}
      {k, v} -> {k, v}
    end)
  end
end
