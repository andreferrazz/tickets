defmodule Backend.Repo.Migrations.TightenOrganizationConstraints do
  use Ecto.Migration

  def up do
    drop index(:events, [:creator_id])

    alter table(:events) do
      modify :organization_id, :uuid, null: false
      remove :creator_id
    end

    # Legacy invitations (accepted or already expired) have no organization
    # in the new model — the role/org-target concept didn't exist when they
    # were issued. Delete them so the NOT NULL constraint below can be added.
    # The user-visible effect is nil: accepted ones already promoted the user;
    # expired ones can't be acted on anyway.
    execute "DELETE FROM invitations WHERE organization_id IS NULL"

    alter table(:invitations) do
      modify :organization_id, :uuid, null: false
      modify :role, :string, size: 20, null: false
    end

    create constraint(:invitations, :invitation_role_must_be_valid,
             check: "role IN ('leader', 'participant')"
           )

    # Existing invitations have statuses 'pending' | 'accepted' | 'expired'
    # after the earlier expiry sweep. Lock the set to those three.
    create constraint(:invitations, :invitation_status_must_be_valid,
             check: "status IN ('pending', 'accepted', 'expired')"
           )
  end

  def down do
    drop constraint(:invitations, :invitation_status_must_be_valid)
    drop constraint(:invitations, :invitation_role_must_be_valid)

    alter table(:invitations) do
      modify :role, :string, size: 20, null: true
      modify :organization_id, :uuid, null: true
    end

    alter table(:events) do
      add :creator_id, references(:users, type: :uuid, on_delete: :delete_all)
      modify :organization_id, :uuid, null: true
    end

    # Restore creator_id from the audit column so the next round-trip migrate
    # (which rebuilds memberships from creator_id) still has data to work
    # with.
    execute "UPDATE events SET creator_id = created_by_id WHERE created_by_id IS NOT NULL"

    create index(:events, [:creator_id])
  end
end
