defmodule Backend.Events.SeatAssignment do
  @moduledoc """
  A buyer's claim on a specific seat (table + number) for an order.

  The table is sparse: only claimed seats exist as rows. A partial unique
  index on `(seat_table_id, seat_number) WHERE released_at IS NULL`
  guarantees no two active assignments collide. Releasing a seat is a
  soft action (sets `released_at`) so the audit trail survives.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "seat_assignments" do
    field :seat_number, :integer
    field :released_at, :utc_datetime

    belongs_to :event, Backend.Events.Event
    belongs_to :seat_table, Backend.Events.SeatTable
    belongs_to :order, Backend.Orders.Order
    belongs_to :order_item, Backend.Orders.OrderItem
    belongs_to :pass, Backend.Tickets.Pass

    timestamps(type: :utc_datetime)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :event_id,
      :seat_table_id,
      :seat_number,
      :order_id,
      :order_item_id,
      :pass_id,
      :released_at
    ])
    |> validate_required([
      :event_id,
      :seat_table_id,
      :seat_number,
      :order_id,
      :order_item_id
    ])
    |> validate_number(:seat_number, greater_than: 0)
    |> unique_constraint([:seat_table_id, :seat_number],
      name: :seat_assignments_active_uniq
    )
  end
end
