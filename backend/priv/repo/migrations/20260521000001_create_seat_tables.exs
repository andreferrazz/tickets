defmodule Backend.Repo.Migrations.CreateSeatTables do
  use Ecto.Migration

  def change do
    create table(:seat_tables, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :event_id, references(:events, type: :uuid, on_delete: :delete_all), null: false
      add :name, :string, size: 120, null: false
      add :position, :integer, null: false, default: 0
      add :deleted_at, :utc_datetime_usec

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:seat_tables, [:event_id])
    create index(:seat_tables, [:event_id, :position])

    create unique_index(:seat_tables, [:event_id, :name],
             where: "deleted_at IS NULL",
             name: :seat_tables_event_id_name_index
           )
  end
end
