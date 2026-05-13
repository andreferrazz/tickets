defmodule Backend.Repo.Migrations.CreateAuthCodes do
  use Ecto.Migration

  def change do
    create table(:auth_codes, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :email, :string, size: 255, null: false
      add :code, :string, size: 6, null: false
      add :expires_at, :utc_datetime, null: false
      add :used, :boolean, null: false, default: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:auth_codes, [:email])
  end
end
