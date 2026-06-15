defmodule Backend.Repo.Migrations.AddExpiresAtToOrders do
  use Ecto.Migration

  def change do
    alter table(:orders) do
      add :expires_at, :utc_datetime
    end
  end
end
