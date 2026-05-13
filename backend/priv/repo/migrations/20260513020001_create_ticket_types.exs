defmodule Backend.Repo.Migrations.CreateTicketTypes do
  use Ecto.Migration

  def change do
    create table(:ticket_types, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :event_id, references(:events, type: :uuid, on_delete: :delete_all), null: false
      add :name, :string, size: 255, null: false
      add :description, :text
      add :price_cents, :integer, null: false
      add :quantity_total, :integer, null: false
      add :quantity_sold, :integer, null: false, default: 0
      add :sales_start, :utc_datetime
      add :sales_end, :utc_datetime
      add :abacate_product_id, :string, size: 255

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:ticket_types, [:event_id])
  end
end
