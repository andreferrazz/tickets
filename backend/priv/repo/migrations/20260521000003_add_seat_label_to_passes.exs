defmodule Backend.Repo.Migrations.AddSeatLabelToPasses do
  use Ecto.Migration

  def change do
    alter table(:passes) do
      add :seat_label, :string, size: 160
    end
  end
end
