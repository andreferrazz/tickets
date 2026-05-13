defmodule Backend.Accounts.AuthCode do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "auth_codes" do
    field :email, :string
    field :code, :string
    field :expires_at, :utc_datetime
    field :used, :boolean, default: false

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:email, :code, :expires_at])
    |> validate_required([:email, :code, :expires_at])
  end
end
