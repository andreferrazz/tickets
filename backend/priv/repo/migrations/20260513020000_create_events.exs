defmodule Backend.Repo.Migrations.CreateEvents do
  use Ecto.Migration

  def change do
    create table(:events, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :creator_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :title, :string, size: 255, null: false
      add :description, :text
      add :location, :string, size: 255
      add :starts_at, :utc_datetime, null: false
      add :ends_at, :utc_datetime
      add :cover_image_url, :text
      add :status, :string, size: 20, null: false, default: "draft"

      timestamps(type: :utc_datetime)
    end

    create index(:events, [:creator_id])
    create index(:events, [:status])
  end
end
