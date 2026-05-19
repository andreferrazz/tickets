defmodule Backend.Events.ExtraItem do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "extra_items" do
    field :name, :string
    field :description, :string
    field :price_cents, :integer
    field :quantity_total, :integer
    field :quantity_sold, :integer, default: 0
    field :show_remaining, :boolean, default: false
    field :abacate_product_id, :string
    field :deleted_at, :utc_datetime_usec

    belongs_to :event, Backend.Events.Event
    belongs_to :section, Backend.Events.ExtraItemSection, foreign_key: :section_id

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :event_id,
      :section_id,
      :name,
      :description,
      :price_cents,
      :quantity_total,
      :show_remaining
    ])
    |> validate_required([:event_id, :section_id, :name, :price_cents])
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
  end

  def update_changeset(extra, attrs) do
    extra
    |> cast(attrs, [
      :section_id,
      :name,
      :description,
      :price_cents,
      :quantity_total,
      :show_remaining
    ])
    |> validate_required([:name, :price_cents])
    |> validate_number(:price_cents, greater_than_or_equal_to: 0)
  end
end
