defmodule Backend.Events.TicketType do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "ticket_types" do
    field :name, :string
    field :description, :string
    field :price_cents, :integer
    field :quantity_total, :integer
    field :quantity_sold, :integer, default: 0
    field :sales_start, :utc_datetime
    field :sales_end, :utc_datetime
    field :abacate_product_id, :string

    belongs_to :event, Backend.Events.Event

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :event_id,
      :name,
      :description,
      :price_cents,
      :quantity_total,
      :sales_start,
      :sales_end
    ])
    |> validate_required([:event_id, :name, :price_cents, :quantity_total])
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:quantity_total, greater_than: 0)
  end

  def update_changeset(ticket_type, attrs) do
    ticket_type
    |> cast(attrs, [:name, :description, :price_cents, :quantity_total, :sales_start, :sales_end])
    |> validate_required([:name, :price_cents, :quantity_total])
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:quantity_total, greater_than: 0)
  end
end
