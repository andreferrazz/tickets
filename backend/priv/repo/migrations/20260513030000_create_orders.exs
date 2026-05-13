defmodule Backend.Repo.Migrations.CreateOrders do
  use Ecto.Migration

  def change do
    create table(:orders, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :uuid), null: false
      add :event_id, references(:events, type: :uuid), null: false
      add :status, :string, size: 20, null: false, default: "pending"
      add :total_cents, :integer, null: false
      add :abacate_checkout_id, :string, size: 255
      add :abacate_payment_url, :text
      add :paid_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:orders, [:user_id])
    create index(:orders, [:event_id])
    create index(:orders, [:abacate_checkout_id])
    create index(:orders, [:status, :inserted_at])
  end
end
