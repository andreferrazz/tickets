defmodule Backend.Repo.Migrations.DropLegacyTicketTypePricing do
  use Ecto.Migration

  # Price, capacity, and the upstream Abacate product live on ticket_batches
  # now. The ticket_type row only describes the product category (name,
  # description, sales window). Run after CreateTicketBatches has backfilled.
  def up do
    alter table(:ticket_types) do
      remove :price_cents
      remove :quantity_total
      remove :quantity_sold
      remove :abacate_product_id
    end
  end

  def down do
    alter table(:ticket_types) do
      add :price_cents, :integer
      add :quantity_total, :integer
      add :quantity_sold, :integer, default: 0
      add :abacate_product_id, :string, size: 255
    end

    execute("""
    UPDATE ticket_types tt
    SET price_cents = b.price_cents,
        quantity_total = b.quantity_total,
        quantity_sold = b.quantity_sold,
        abacate_product_id = b.abacate_product_id
    FROM ticket_batches b
    WHERE b.ticket_type_id = tt.id AND b.sequence = 1
    """)
  end
end
