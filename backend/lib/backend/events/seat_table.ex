defmodule Backend.Events.SeatTable do
  @moduledoc """
  A named, rounded table at an event. Seats inside the table are auto-numbered
  `1..event.seats_per_table` and tracked as `SeatAssignment` rows once claimed.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "seat_tables" do
    field :name, :string
    field :position, :integer, default: 0
    field :deleted_at, :utc_datetime_usec

    belongs_to :event, Backend.Events.Event
    has_many :assignments, Backend.Events.SeatAssignment

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:event_id, :name, :position])
    |> validate_required([:event_id, :name])
    |> validate_length(:name, max: 120)
    |> unique_constraint([:event_id, :name], name: :seat_tables_event_id_name_index)
  end

  def update_changeset(seat_table, attrs) do
    seat_table
    |> cast(attrs, [:name, :position])
    |> validate_required([:name])
    |> validate_length(:name, max: 120)
    |> unique_constraint([:event_id, :name], name: :seat_tables_event_id_name_index)
  end
end
