defmodule Backend.Repo.Migrations.AddShowRemainingToExtraItems do
  use Ecto.Migration

  def change do
    alter table(:extra_items) do
      add :show_remaining, :boolean, null: false, default: false
    end
  end
end
