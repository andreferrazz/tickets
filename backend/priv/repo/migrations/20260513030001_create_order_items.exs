defmodule Backend.Repo.Migrations.CreateOrderItems do
  use Ecto.Migration

  def change do
    create table(:order_items, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :order_id, references(:orders, type: :uuid, on_delete: :delete_all), null: false
      add :item_type, :string, size: 20, null: false
      # Polymorphic reference — no FK constraint since it points to two tables.
      add :item_id, :uuid, null: false
      add :item_name, :string, size: 255, null: false
      add :quantity, :integer, null: false, default: 1
      add :unit_price_cents, :integer, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:order_items, [:order_id])
  end
end
