defmodule Backend.Repo.Migrations.CreateInvitations do
  use Ecto.Migration

  def change do
    create table(:invitations, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :inviter_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :email, :string, size: 255, null: false
      add :status, :string, size: 20, null: false, default: "pending"

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:invitations, [:email])
    create index(:invitations, [:inviter_id])
  end
end
