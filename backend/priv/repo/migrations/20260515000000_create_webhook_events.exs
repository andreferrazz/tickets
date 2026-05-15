defmodule Backend.Repo.Migrations.CreateWebhookEvents do
  use Ecto.Migration

  def change do
    create table(:webhook_events, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :event_type, :string, size: 50
      add :payload, :map, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:webhook_events, [:event_type])
    create index(:webhook_events, [:inserted_at])
  end
end
