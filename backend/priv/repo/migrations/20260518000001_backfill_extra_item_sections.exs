defmodule Backend.Repo.Migrations.BackfillExtraItemSections do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def up do
    # Create one default "Addons" section per event so every event satisfies
    # the new invariant (every event has at least one section). Picks up
    # soft-deleted events too — their extras may still need an owning section.
    execute("""
    INSERT INTO extra_item_sections (id, event_id, title, position, inserted_at)
    SELECT gen_random_uuid(), e.id, 'Addons', 0, NOW()
    FROM events e
    """)

    # Attach every existing extra_item to its event's default section.
    execute("""
    UPDATE extra_items x
    SET section_id = s.id
    FROM extra_item_sections s
    WHERE s.event_id = x.event_id
      AND x.section_id IS NULL
    """)

    alter table(:extra_items) do
      modify :section_id, :uuid, null: false
    end
  end

  def down do
    alter table(:extra_items) do
      modify :section_id, :uuid, null: true
    end

    execute("UPDATE extra_items SET section_id = NULL")
    execute("DELETE FROM extra_item_sections")
  end
end
