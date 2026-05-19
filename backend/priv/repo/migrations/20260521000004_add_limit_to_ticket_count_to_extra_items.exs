defmodule Backend.Repo.Migrations.AddLimitToTicketCountToExtraItems do
  use Ecto.Migration

  def change do
    alter table(:extra_items) do
      add :limit_to_ticket_count, :boolean, null: false, default: false
    end
  end
end
