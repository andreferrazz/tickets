defmodule Backend.Repo.Migrations.AddDeletedAtToBusinessResources do
  use Ecto.Migration

  def change do
    alter table(:events) do
      add :deleted_at, :utc_datetime_usec
    end

    alter table(:ticket_types) do
      add :deleted_at, :utc_datetime_usec
    end

    alter table(:extra_items) do
      add :deleted_at, :utc_datetime_usec
    end

    # Partial indexes so the common "not deleted" reads stay fast without
    # bloating the index with tombstoned rows.
    create index(:events, [:starts_at],
             where: "deleted_at IS NULL",
             name: :events_starts_at_active_index
           )

    create index(:ticket_types, [:event_id],
             where: "deleted_at IS NULL",
             name: :ticket_types_event_id_active_index
           )

    create index(:extra_items, [:event_id],
             where: "deleted_at IS NULL",
             name: :extra_items_event_id_active_index
           )
  end
end
