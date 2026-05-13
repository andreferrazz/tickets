defmodule Backend.Invitations.Invitation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "invitations" do
    field :email, :string
    field :status, :string, default: "pending"
    field :token, :string
    field :expires_at, :utc_datetime
    belongs_to :inviter, Backend.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:inviter_id, :email, :status, :token, :expires_at])
    |> validate_required([:inviter_id, :email, :token, :expires_at])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:status, ~w(pending accepted))
    |> unique_constraint(:token)
  end
end
