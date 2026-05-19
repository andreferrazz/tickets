defmodule Backend.Repo.Migrations.AddSeatSelectionToEvents do
  use Ecto.Migration

  def change do
    alter table(:events) do
      add :seat_selection_enabled, :boolean, null: false, default: false
      add :seats_per_table, :integer
    end
  end
end
