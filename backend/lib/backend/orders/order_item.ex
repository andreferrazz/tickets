defmodule Backend.Orders.OrderItem do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "order_items" do
    field :item_type, :string
    field :item_id, :binary_id
    field :item_name, :string
    field :quantity, :integer, default: 1
    field :unit_price_cents, :integer

    belongs_to :order, Backend.Orders.Order

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:order_id, :item_type, :item_id, :item_name, :quantity, :unit_price_cents])
    |> validate_required([
      :order_id,
      :item_type,
      :item_id,
      :item_name,
      :quantity,
      :unit_price_cents
    ])
    |> validate_inclusion(:item_type, ~w(ticket extra))
    |> validate_number(:quantity, greater_than: 0)
    |> validate_number(:unit_price_cents, greater_than_or_equal_to: 0)
  end
end
