defmodule Backend.Repo.Migrations.AddPlatformFeeToOrders do
  use Ecto.Migration

  # Abacate Pay reports the actual fee charged at `data.checkout.platformFee`
  # on `checkout.completed`. Storing it lets the dashboard subtract the real
  # amount instead of estimating from the public fee table — useful because
  # the seller's effective rate can differ from the published one
  # (negotiated rates, devMode, promos, etc.).
  def change do
    alter table(:orders) do
      add :platform_fee_cents, :integer
    end
  end
end
