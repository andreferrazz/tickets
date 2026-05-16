defmodule Backend.Repo.Migrations.AddProfileFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :name, :string, size: 255
      add :cellphone, :string, size: 32
      add :tax_id, :string, size: 32
      add :abacate_customer_id, :string, size: 64
    end

    create index(:users, [:abacate_customer_id], where: "abacate_customer_id IS NOT NULL")
  end
end
