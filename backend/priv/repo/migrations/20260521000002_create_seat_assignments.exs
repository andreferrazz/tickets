defmodule Backend.Repo.Migrations.CreateSeatAssignments do
  use Ecto.Migration

  def change do
    create table(:seat_assignments, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :event_id, references(:events, type: :uuid, on_delete: :delete_all), null: false
      add :seat_table_id, references(:seat_tables, type: :uuid, on_delete: :restrict), null: false
      add :seat_number, :integer, null: false
      add :order_id, references(:orders, type: :uuid, on_delete: :restrict), null: false
      add :order_item_id, references(:order_items, type: :uuid, on_delete: :restrict), null: false
      add :pass_id, references(:passes, type: :uuid, on_delete: :nilify_all)
      add :released_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:seat_assignments, [:event_id])
    create index(:seat_assignments, [:order_id])
    create index(:seat_assignments, [:order_item_id])

    # Partial unique index = race-condition backstop. Concurrent INSERTs for
    # the same (seat_table_id, seat_number) raise. Releasing the seat
    # (released_at IS NOT NULL) immediately frees the slot for reuse.
    create unique_index(:seat_assignments, [:seat_table_id, :seat_number],
             where: "released_at IS NULL",
             name: :seat_assignments_active_uniq
           )
  end
end
