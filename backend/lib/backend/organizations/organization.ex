defmodule Backend.Organizations.Organization do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @pix_key_types ~w(cpf cnpj email phone evp)

  schema "organizations" do
    field :name, :string
    field :pix_key, :string
    field :pix_key_type, :string

    has_many :memberships, Backend.Organizations.Membership
    has_many :events, Backend.Events.Event

    timestamps(type: :utc_datetime)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:name])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 255)
  end

  def update_changeset(org, attrs) do
    org
    |> cast(attrs, [:name])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 255)
  end

  @doc """
  Changes the PIX payout destination. Both fields must be set together; sending
  one without the other (or invalid type) is rejected. To clear the destination,
  send both as nil — handled by the controller, not here.
  """
  def payout_settings_changeset(org, attrs) do
    org
    |> cast(attrs, [:pix_key, :pix_key_type])
    |> validate_required([:pix_key, :pix_key_type])
    |> validate_inclusion(:pix_key_type, @pix_key_types)
    |> validate_length(:pix_key, min: 1, max: 255)
  end

  def pix_key_types, do: @pix_key_types
end
