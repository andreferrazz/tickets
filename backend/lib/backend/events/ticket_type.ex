defmodule Backend.Events.TicketType do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "ticket_types" do
    field :name, :string
    field :description, :string
    field :sales_start, :utc_datetime
    field :sales_end, :utc_datetime
    field :deleted_at, :utc_datetime_usec

    belongs_to :event, Backend.Events.Event
    has_many :batches, Backend.Events.TicketBatch, preload_order: [asc: :sequence]

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:event_id, :name, :description, :sales_start, :sales_end])
    |> validate_required([:event_id, :name])
  end

  def update_changeset(ticket_type, attrs) do
    ticket_type
    |> cast(attrs, [:name, :description, :sales_start, :sales_end])
    |> validate_required([:name])
  end
end
