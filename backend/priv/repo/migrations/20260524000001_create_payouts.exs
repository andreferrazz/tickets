defmodule Backend.Repo.Migrations.CreatePayouts do
  use Ecto.Migration

  def change do
    create table(:payouts, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :event_id, references(:events, type: :uuid, on_delete: :restrict), null: false

      add :requested_by_id, references(:users, type: :uuid, on_delete: :nilify_all)

      add :amount_cents, :integer, null: false
      add :pix_key, :string, null: false
      add :pix_key_type, :string, null: false, size: 10
      add :external_id, :string, null: false
      add :abacate_payout_id, :string
      add :status, :string, null: false, size: 20
      add :error_message, :text
      add :receipt_url, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:payouts, [:external_id])
    create index(:payouts, [:event_id, :inserted_at])
    create index(:payouts, [:abacate_payout_id])

    create constraint(:payouts, :amount_cents_within_limits,
             check: "amount_cents > 0 AND amount_cents <= 500000"
           )

    create constraint(:payouts, :status_valid,
             check:
               "status IN ('pending','complete','failed','cancelled','refunded','expired')"
           )

    create constraint(:payouts, :pix_key_type_valid,
             check: "pix_key_type IN ('cpf','cnpj','email','phone','evp')"
           )
  end
end
