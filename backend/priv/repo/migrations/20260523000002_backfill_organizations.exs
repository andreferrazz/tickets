defmodule Backend.Repo.Migrations.BackfillOrganizations do
  use Ecto.Migration

  @moduledoc """
  Backfills organizations and assigns existing events to them.

  For each user that needs an org (every creator, plus any admin who already
  owns events that need a `NOT NULL` `organization_id`):
    * Insert an `organizations` row named after the user (`name`, or
      `"Organization"` when blank).
    * Update their events: set `organization_id` to the new org and copy
      `creator_id` to `created_by_id` (audit field).

  **Memberships are inserted only for creators.** Admins are intentionally
  *not* added to `organization_memberships`: they are role-agnostic and
  bypass org-membership checks via the global `role = 'admin'`. Auto-created
  admin orgs end up leader-less; that's allowed (the partial unique index
  on `role = 'leader'` permits zero leaders), and admin can still manage the
  legacy events through the role bypass.

  Raw SQL keeps this migration decoupled from the application's Ecto schemas
  — a future schema change cannot retroactively break it.
  """

  def up do
    # Per-user pairing is captured in a temp table so the UPDATE on events
    # at the end of the migration can join it cleanly.
    execute """
    CREATE TEMP TABLE _user_org_map (
      user_id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      is_creator boolean NOT NULL
    ) ON COMMIT DROP
    """

    # Iterate row-by-row so each user gets a distinct organization even when
    # two users happen to share the same `name`. Includes creators (always)
    # and admins who own events (so the events have an org to belong to).
    execute """
    DO $$
    DECLARE
      person RECORD;
      new_org_id uuid;
    BEGIN
      FOR person IN
        SELECT u.id, u.name, (u.role = 'creator') AS is_creator
          FROM users u
         WHERE u.role = 'creator'
            OR (u.role = 'admin'
                AND EXISTS (SELECT 1 FROM events e WHERE e.creator_id = u.id))
      LOOP
        INSERT INTO organizations (id, name, inserted_at, updated_at)
        VALUES (
          gen_random_uuid(),
          COALESCE(NULLIF(person.name, ''), 'Organization'),
          NOW(),
          NOW()
        )
        RETURNING id INTO new_org_id;

        INSERT INTO _user_org_map (user_id, organization_id, is_creator)
        VALUES (person.id, new_org_id, person.is_creator);

        IF person.is_creator THEN
          INSERT INTO organization_memberships
            (id, organization_id, user_id, role, inserted_at, updated_at)
          VALUES
            (gen_random_uuid(), new_org_id, person.id, 'leader', NOW(), NOW());
        END IF;
      END LOOP;
    END$$;
    """

    # Assign every existing event to its creator's org and copy creator_id to
    # created_by_id for the audit trail.
    execute """
    UPDATE events e
       SET organization_id = m.organization_id,
           created_by_id   = e.creator_id
      FROM _user_org_map m
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
