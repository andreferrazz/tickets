defmodule Backend.Repo.Migrations.AddPaymentMethodToOrders do
  use Ecto.Migration

  # Captures what Abacate Pay reports on `checkout.completed` so we can compute
  # the per-order fee on the dashboard. Both columns are nullable: legacy paid
  # orders predate this field, and PIX orders carry no installment.
  def change do
    alter table(:orders) do
      add :payment_method, :string
      add :card_installments, :integer
    end
  end
end
