defmodule Backend.Orders.Order do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "orders" do
    field :status, :string, default: "pending"
    field :total_cents, :integer
    field :abacate_checkout_id, :string
    field :abacate_payment_url, :string
    field :paid_at, :utc_datetime
    # Captured from the checkout.completed webhook so the dashboard can show
    # net revenue. `platform_fee_cents` is Abacate's authoritative figure;
    # method/installments are kept for display and as a fallback when the
    # platform fee isn't reported. Nil on legacy rows.
    field :payment_method, :string
    field :card_installments, :integer
    field :platform_fee_cents, :integer
    # Populated via join, not stored in DB.
    field :event_title, :string, virtual: true

    belongs_to :user, Backend.Accounts.User
    belongs_to :event, Backend.Events.Event
    has_many :items, Backend.Orders.OrderItem

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(pending paid expired refunded)
  @valid_payment_methods ~w(PIX CARD)

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :user_id,
      :event_id,
      :status,
      :total_cents,
      :abacate_checkout_id,
      :abacate_payment_url,
      :paid_at,
      :payment_method,
      :card_installments,
      :platform_fee_cents
    ])
    |> validate_required([:user_id, :event_id, :total_cents])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:payment_method, @valid_payment_methods)
  end
end
