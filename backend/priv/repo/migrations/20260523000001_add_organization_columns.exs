defmodule Backend.Repo.Migrations.AddOrganizationColumns do
  use Ecto.Migration

  def up do
    # Pending invitations created before the org partitioning have no
    # organization to attach to — their semantics changed (global creator
    # promotion → org-scoped role assignment). Expire them rather than try to
    # guess an org. Migration C will run after this and will not see them as
    # pending, so they are safely ignored during backfill.
    execute """
    UPDATE invitations
       SET status = 'expired'
     WHERE status = 'pending'
    """

    alter table(:events) do
      add :organization_id, references(:organizations, type: :uuid, on_delete: :restrict)
      add :created_by_id, references(:users, type: :uuid, on_delete: :nilify_all)
    end

    create index(:events, [:organization_id])
    create index(:events, [:created_by_id])

    alter table(:invitations) do
      add :organization_id, references(:organizations, type: :uuid, on_delete: :delete_all)
      add :role, :string, size: 20
    end

    create index(:invitations, [:organization_id])
  end

  def down do
    drop index(:invitations, [:organization_id])

    alter table(:invitations) do
      remove :role
      remove :organization_id
    end

    drop index(:events, [:created_by_id])
    drop index(:events, [:organization_id])

    alter table(:events) do
      remove :created_by_id
      remove :organization_id
    end
  end
end
