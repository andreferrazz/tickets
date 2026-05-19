defmodule Backend.Tickets do
  @moduledoc """
  Issues and validates scannable passes (tickets and extras) tied to an order.

  Passes are created in a single transaction after payment confirmation. The
  operation is idempotent: re-running `issue_for_order/1` on an order that
  already has passes returns the existing list without inserting or modifying
  rows. This is required because Abacate Pay may deliver the same webhook
  multiple times.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Events.Seating
  alias Backend.Orders.{Order, OrderItem}
  alias Backend.Tickets.Pass

  @token_bytes 18

  @doc """
  Issues passes for `order`. Returns `{:ok, passes, :created | :existed}`.

  Caller uses the third element to gate side effects (email sending) so that
  retried webhooks don't dispatch duplicate emails.
  """
  @spec issue_for_order(Order.t()) ::
          {:ok, [Pass.t()], :created | :existed} | {:error, term()}
  def issue_for_order(%Order{} = order) do
    case list_for_order(order) do
      [] -> insert_passes(order)
      passes -> {:ok, passes, :existed}
    end
  end

  @doc "Returns all passes for `order`, oldest first."
  @spec list_for_order(Order.t()) :: [Pass.t()]
  def list_for_order(%Order{id: id}) do
    Repo.all(from p in Pass, where: p.order_id == ^id, order_by: [asc: p.inserted_at])
  end

  @doc "Looks up a pass by its QR token."
  @spec fetch_by_token(String.t()) :: {:ok, Pass.t()} | {:error, :not_found}
  def fetch_by_token(token) when is_binary(token) do
    case Repo.get_by(Pass, token: token) do
      nil -> {:error, :not_found}
      pass -> {:ok, pass}
    end
  end

  @doc """
  Marks `pass` as checked in by `scanner`. Idempotent: returns
  `{:ok, pass, :already_checked_in}` if it was already scanned.
  """
  @spec check_in(Pass.t(), Backend.Accounts.User.t()) ::
          {:ok, Pass.t(), :checked_in | :already_checked_in}
  def check_in(%Pass{checked_in_at: %DateTime{}} = pass, _scanner) do
    {:ok, pass, :already_checked_in}
  end

  def check_in(%Pass{} = pass, scanner) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    {:ok, updated} =
      pass
      |> Pass.check_in_changeset(%{checked_in_at: now, checked_in_by_user_id: scanner.id})
      |> Repo.update()

    {:ok, updated, :checked_in}
  end

  @doc "Returns the raw PNG bytes for the QR code encoding `pass.token`."
  @spec qr_png(Pass.t()) :: binary()
  def qr_png(%Pass{token: token}) do
    token
    |> EQRCode.encode()
    |> EQRCode.png(width: 480)
  end

  # ---------------------------------------------------------------------------
  # Private
  # ---------------------------------------------------------------------------

  defp insert_passes(%Order{} = order) do
    order = Repo.preload(order, :items)
    seat_index = build_seat_index(order.id)

    Repo.transaction(fn ->
      ticket_rows = Enum.flat_map(order.items, &expand_ticket_item(&1, order, seat_index))
      extra_row = build_extra_row(order)

      (ticket_rows ++ List.wrap(extra_row))
      |> Enum.map(&insert_pass_with_seat!/1)
    end)
    |> case do
      {:ok, passes} -> {:ok, passes, :created}
      {:error, reason} -> {:error, reason}
    end
  end

  # Pre-fetches all active seat assignments for this order, grouped by
  # `order_item_id`. For seated orders the list length per item equals
  # `item.quantity`; for unseated orders the index is empty.
  defp build_seat_index(order_id) do
    Seating.list_for_pass_issuance(order_id)
    |> Enum.group_by(& &1.order_item_id)
  end

  defp expand_ticket_item(%OrderItem{item_type: "ticket"} = item, order, seat_index) do
    assignments = Map.get(seat_index, item.id, [])

    for n <- 1..item.quantity do
      assignment = Enum.at(assignments, n - 1)

      %{
        token: generate_token(),
        kind: "ticket",
        item_name: item.item_name,
        seat_label: seat_label(assignment),
        order_id: order.id,
        order_item_id: item.id,
        event_id: order.event_id,
        user_id: order.user_id,
        _assignment: assignment
      }
    end
  end

  defp expand_ticket_item(_, _, _), do: []

  defp seat_label(nil), do: nil

  defp seat_label(assignment) do
    "#{assignment.seat_table.name} · Lugar #{assignment.seat_number}"
  end

  defp build_extra_row(%Order{} = order) do
    if Enum.any?(order.items, &(&1.item_type == "extra")) do
      %{
        token: generate_token(),
        kind: "extra",
        item_name: "Extras",
        seat_label: nil,
        order_id: order.id,
        order_item_id: nil,
        event_id: order.event_id,
        user_id: order.user_id,
        _assignment: nil
      }
    end
  end

  defp insert_pass_with_seat!(attrs) do
    {assignment, pass_attrs} = Map.pop(attrs, :_assignment)

    pass =
      pass_attrs
      |> Pass.changeset()
      |> Repo.insert!()

    if assignment, do: Seating.set_pass_id(assignment, pass.id)
    pass
  end

  defp generate_token do
    :crypto.strong_rand_bytes(@token_bytes) |> Base.url_encode64(padding: false)
  end
end
