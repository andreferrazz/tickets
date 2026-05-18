defmodule Backend.Repo.Migrations.CreateTicketBatches do
  use Ecto.Migration

  def up do
    create table(:ticket_batches, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")

      add :ticket_type_id, references(:ticket_types, type: :uuid, on_delete: :delete_all),
        null: false

      add :sequence, :integer, null: false
      add :price_cents, :integer, null: false
      add :quantity_total, :integer, null: false
      add :quantity_sold, :integer, null: false, default: 0
      add :closed_at, :utc_datetime
      add :auto_closed, :boolean, null: false, default: false
      add :abacate_product_id, :string, size: 255

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:ticket_batches, [:ticket_type_id])
    create unique_index(:ticket_batches, [:ticket_type_id, :sequence])

    # Backfill: every existing ticket_type becomes its own Lote 1. Carries
    # forward the current pricing, capacity, sold count, and Abacate product so
    # in-flight orders keep working. If the ticket type is already sold out,
    # close the batch so the resolver doesn't try to keep using it.
    execute("""
    INSERT INTO ticket_batches
      (id, ticket_type_id, sequence, price_cents, quantity_total, quantity_sold,
       closed_at, auto_closed, abacate_product_id, inserted_at)
    SELECT
      gen_random_uuid(),
      tt.id,
      1,
      tt.price_cents,
      tt.quantity_total,
      tt.quantity_sold,
      CASE WHEN tt.quantity_sold >= tt.quantity_total THEN NOW() ELSE NULL END,
      tt.quantity_sold >= tt.quantity_total,
      tt.abacate_product_id,
      NOW()
    FROM ticket_types tt
    """)

    alter table(:order_items) do
      add :batch_id, :uuid
    end

    # Backfill: every existing ticket order_item points at the only batch we
    # just created for its ticket_type. Extras have no batch (NULL).
    execute("""
    UPDATE order_items oi
    SET batch_id = b.id
    FROM ticket_batches b
    WHERE oi.item_type = 'ticket'
      AND b.ticket_type_id = oi.item_id
      AND b.sequence = 1
    """)
  end

  def down do
    alter table(:order_items) do
      remove :batch_id
    end

    drop table(:ticket_batches)
  end
end
