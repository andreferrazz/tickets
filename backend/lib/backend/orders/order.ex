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
    # Populated via join, not stored in DB.
    field :event_title, :string, virtual: true

    belongs_to :user, Backend.Accounts.User
    belongs_to :event, Backend.Events.Event
    has_many :items, Backend.Orders.OrderItem

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(pending paid expired refunded)

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :user_id,
      :event_id,
      :status,
      :total_cents,
      :abacate_checkout_id,
      :abacate_payment_url,
      :paid_at
    ])
    |> validate_required([:user_id, :event_id, :total_cents])
    |> validate_inclusion(:status, @valid_statuses)
  end
end
