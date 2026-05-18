defmodule Backend.Events.TicketBatch do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "ticket_batches" do
    field :sequence, :integer
    field :price_cents, :integer
    field :quantity_total, :integer
    field :quantity_sold, :integer, default: 0
    field :closed_at, :utc_datetime
    field :auto_closed, :boolean, default: false
    field :abacate_product_id, :string

    belongs_to :ticket_type, Backend.Events.TicketType

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def create_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:ticket_type_id, :sequence, :price_cents, :quantity_total])
    |> validate_required([:ticket_type_id, :sequence, :price_cents, :quantity_total])
    |> validate_number(:sequence, greater_than: 0)
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:quantity_total, greater_than: 0)
    |> unique_constraint([:ticket_type_id, :sequence])
  end

  # Editing the price or capacity of a batch. Refuses to drop capacity below
  # what's already been sold so a creator can't accidentally oversell.
  def update_changeset(batch, attrs) do
    batch
    |> cast(attrs, [:price_cents, :quantity_total])
    |> validate_required([:price_cents, :quantity_total])
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
    |> validate_number(:quantity_total, greater_than: 0)
    |> validate_change(:quantity_total, fn :quantity_total, qty ->
      if qty < batch.quantity_sold,
        do: [quantity_total: "cannot be less than quantity_sold (#{batch.quantity_sold})"],
        else: []
    end)
  end
end
