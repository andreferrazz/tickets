defmodule Backend.Tickets.Pass do
  @moduledoc """
  A scannable pass issued after payment. `kind` is either `"ticket"` (one row per
  ticket unit) or `"extra"` (one combined row for all extra items in an order).
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "passes" do
    field :token, :string
    field :kind, :string
    field :item_name, :string
    field :checked_in_at, :utc_datetime

    belongs_to :order, Backend.Orders.Order
    belongs_to :order_item, Backend.Orders.OrderItem
    belongs_to :event, Backend.Events.Event
    belongs_to :user, Backend.Accounts.User
    belongs_to :checked_in_by, Backend.Accounts.User, foreign_key: :checked_in_by_user_id

    timestamps(type: :utc_datetime)
  end

  @valid_kinds ~w(ticket extra)

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :token,
      :kind,
      :item_name,
      :order_id,
      :order_item_id,
      :event_id,
      :user_id
    ])
    |> validate_required([:token, :kind, :item_name, :order_id, :event_id, :user_id])
    |> validate_inclusion(:kind, @valid_kinds)
    |> unique_constraint(:token)
    |> unique_constraint(:order_id, name: :passes_one_extra_per_order)
  end

  def check_in_changeset(pass, %{checked_in_at: at, checked_in_by_user_id: by}) do
    pass
    |> cast(%{checked_in_at: at, checked_in_by_user_id: by}, [
      :checked_in_at,
      :checked_in_by_user_id
    ])
    |> validate_required([:checked_in_at, :checked_in_by_user_id])
  end
end
