defmodule Backend.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :email, :string
    field :role, :string, default: "buyer"
    belongs_to :invited_by_user, Backend.Accounts.User, foreign_key: :invited_by

    timestamps(type: :utc_datetime)
  end

  @valid_roles ~w(buyer creator admin)

  def changeset(user \\ %__MODULE__{}, attrs) do
    user
    |> cast(attrs, [:email, :role, :invited_by])
    |> validate_required([:email])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:role, @valid_roles)
    |> unique_constraint(:email)
  end
end
