defmodule Backend.Repo.Migrations.DropSeating do
  use Ecto.Migration

  @moduledoc """
  Seat selection never shipped in the frontend and is removed ahead of the
  SvelteKit migration (plan step 1). Irreversible on purpose: the seat tables
  held no production data worth recreating, and a reversible version would
  have to re-declare the full schema just to roll back to an unused feature.
  """

  def up do
    drop table(:seat_assignments)
    drop table(:seat_tables)

    alter table(:events) do
      remove :seat_selection_enabled
      remove :seats_per_table
    end

    alter table(:passes) do
      remove :seat_label
    end
  end

  def down do
    raise Ecto.MigrationError,
      message: "drop_seating cannot be rolled back: seat tables and columns were removed"
  end
end
