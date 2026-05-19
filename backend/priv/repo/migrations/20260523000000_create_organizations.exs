defmodule Backend.Repo.Migrations.CreateOrganizations do
  use Ecto.Migration

  def change do
    create table(:organizations, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :name, :string, size: 255, null: false

      timestamps(type: :utc_datetime)
    end

    create table(:organization_memberships, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")

      add :organization_id,
          references(:organizations, type: :uuid, on_delete: :delete_all),
          null: false

      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :role, :string, size: 20, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:organization_memberships, [:organization_id, :user_id])
    create index(:organization_memberships, [:user_id])

    # One leader per organization — enforced at the DB layer so racing inserts
    # cannot create two leaders for the same org.
    create unique_index(:organization_memberships, [:organization_id],
             where: "role = 'leader'",
             name: :organization_memberships_one_leader_index
           )

    create constraint(:organization_memberships, :role_must_be_valid,
             check: "role IN ('leader', 'participant')"
           )
  end
end
