defmodule Backend.Payouts.Payout do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @max_amount_cents 500_000
  @valid_statuses ~w(pending complete failed cancelled refunded expired)
  @pix_key_types ~w(cpf cnpj email phone evp)

  schema "payouts" do
    field :amount_cents, :integer
    field :pix_key, :string
    field :pix_key_type, :string
    field :external_id, :string
    field :abacate_payout_id, :string
    field :status, :string
    field :error_message, :string
    field :receipt_url, :string

    belongs_to :event, Backend.Events.Event
    belongs_to :requested_by, Backend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def create_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :event_id,
      :requested_by_id,
      :amount_cents,
      :pix_key,
      :pix_key_type,
      :external_id,
      :status
    ])
    |> validate_required([
      :event_id,
      :amount_cents,
      :pix_key,
      :pix_key_type,
      :external_id,
      :status
    ])
    |> validate_number(:amount_cents, greater_than: 0, less_than_or_equal_to: @max_amount_cents)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:pix_key_type, @pix_key_types)
    |> unique_constraint(:external_id)
  end

  def settle_changeset(payout, attrs) do
    payout
    |> cast(attrs, [:status, :abacate_payout_id, :receipt_url, :error_message])
    |> validate_inclusion(:status, @valid_statuses)
  end

  def max_amount_cents, do: @max_amount_cents
  def valid_statuses, do: @valid_statuses
end
