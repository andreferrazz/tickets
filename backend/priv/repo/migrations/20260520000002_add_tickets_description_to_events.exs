defmodule Backend.Repo.Migrations.AddTicketsDescriptionToEvents do
  use Ecto.Migration

  def change do
    alter table(:events) do
      add :tickets_description, :text
    end
  end
end
