defmodule Backend.Repo.Migrations.CreatePasses do
  use Ecto.Migration

  def change do
    create table(:passes, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :token, :string, size: 64, null: false
      add :kind, :string, size: 20, null: false
      add :order_id, references(:orders, type: :uuid, on_delete: :delete_all), null: false
      add :order_item_id, references(:order_items, type: :uuid, on_delete: :nilify_all)
      add :event_id, references(:events, type: :uuid, on_delete: :restrict), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :restrict), null: false
      add :item_name, :string, size: 255, null: false
      add :checked_in_at, :utc_datetime
      add :checked_in_by_user_id, references(:users, type: :uuid, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:passes, [:token])
    create index(:passes, [:order_id])
    create index(:passes, [:event_id])

    create unique_index(:passes, [:order_id],
             where: "kind = 'extra'",
             name: :passes_one_extra_per_order
           )
  end
end
