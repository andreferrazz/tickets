defmodule Backend.Repo.Migrations.BackfillOrganizations do
  use Ecto.Migration

  @moduledoc """
  Backfills one organization per existing creator/admin and assigns existing
  events to those organizations.

  For each `users` row with `role IN ('creator', 'admin')` *and* who has
  created at least one event:
    * Insert an `organizations` row named after the user (`name`, or
      `"Organization"` when `name` is blank).
    * Insert an `organization_memberships` row making the user the leader.
    * Update every event owned by that user: set `organization_id` to the new
      org and copy `creator_id` to `created_by_id` (audit field).

  Admins are included so legacy admin-created events have an organization to
  belong to. Going forward, admins still bypass org membership for
  authorization via the global role check; the membership is only material
  here because pre-existing rows need a non-null FK.

  Raw SQL keeps this migration decoupled from the application's Ecto schemas
  — a future schema change cannot retroactively break it.
  """

  def up do
    # Per-creator pairing is captured in a temp table so the UPDATE on events
    # at the end of the migration can join it cleanly.
    execute """
    CREATE TEMP TABLE _creator_org_map (
      user_id uuid PRIMARY KEY,
      organization_id uuid NOT NULL
    ) ON COMMIT DROP
    """

    # Iterate row-by-row so each creator gets a distinct organization even when
    # two creators happen to share the same `name`. The dataset is small (one
    # row per creator), so the procedural loop is acceptable.
    execute """
    DO $$
    DECLARE
      creator RECORD;
      new_org_id uuid;
    BEGIN
      FOR creator IN
        SELECT DISTINCT u.id, u.name
          FROM users u
         WHERE u.role IN ('creator', 'admin')
            OR EXISTS (SELECT 1 FROM events e WHERE e.creator_id = u.id)
      LOOP
        INSERT INTO organizations (id, name, inserted_at, updated_at)
        VALUES (
          gen_random_uuid(),
          COALESCE(NULLIF(creator.name, ''), 'Organization'),
          NOW(),
          NOW()
        )
        RETURNING id INTO new_org_id;

        INSERT INTO _creator_org_map (user_id, organization_id)
        VALUES (creator.id, new_org_id);

        INSERT INTO organization_memberships (id, organization_id, user_id, role, inserted_at, updated_at)
        VALUES (gen_random_uuid(), new_org_id, creator.id, 'leader', NOW(), NOW());
      END LOOP;
    END$$;
    """

    # Assign every existing event to its creator's org and copy creator_id to
    # created_by_id for the audit trail.
    execute """
    UPDATE events e
       SET organization_id = m.organization_id,
           created_by_id   = e.creator_id
      FROM _creator_org_map m
     WHERE m.user_id = e.creator_id
    """
  end

  def down do
    # Reverse the backfill: clear the columns on events, then drop memberships
    # and organizations. Pending invitations expired in the prior migration
    # stay expired — that data loss is intentional and not worth restoring.
    execute "UPDATE events SET organization_id = NULL, created_by_id = NULL"
    execute "DELETE FROM organization_memberships"
    execute "DELETE FROM organizations"
  end
end
