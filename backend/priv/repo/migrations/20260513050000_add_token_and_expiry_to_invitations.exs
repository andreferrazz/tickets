defmodule Backend.Repo.Migrations.AddTokenAndExpiryToInvitations do
  use Ecto.Migration

  def up do
    alter table(:invitations) do
      add :token, :string, size: 64
      add :expires_at, :utc_datetime
    end

    # Backfill: random token per row, expires_at = inserted_at + 24h.
    execute """
    UPDATE invitations
       SET token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
           expires_at = inserted_at + interval '24 hours'
     WHERE token IS NULL
    """

    alter table(:invitations) do
      modify :token, :string, size: 64, null: false
      modify :expires_at, :utc_datetime, null: false
    end

    create unique_index(:invitations, [:token])
    create index(:invitations, [:expires_at])
  end

  def down do
    drop index(:invitations, [:expires_at])
    drop unique_index(:invitations, [:token])

    alter table(:invitations) do
      remove :expires_at
      remove :token
    end
  end
end
