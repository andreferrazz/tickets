defmodule Backend.Repo.Migrations.CreateExtraItemSections do
  use Ecto.Migration

  def change do
    create table(:extra_item_sections, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :event_id, references(:events, type: :uuid, on_delete: :delete_all), null: false
      add :title, :string, size: 255, null: false
      add :description, :text
      add :position, :integer, null: false, default: 0
      add :deleted_at, :utc_datetime_usec

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:extra_item_sections, [:event_id])
    create index(:extra_item_sections, [:event_id, :position])

    alter table(:extra_items) do
      add :section_id, references(:extra_item_sections, type: :uuid, on_delete: :restrict)
    end

    create index(:extra_items, [:section_id])
  end
end
