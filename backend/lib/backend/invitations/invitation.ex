defmodule Backend.Invitations.Invitation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "invitations" do
    field :email, :string
    field :status, :string, default: "pending"
    belongs_to :inviter, Backend.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:inviter_id, :email, :status])
    |> validate_required([:inviter_id, :email])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:status, ~w(pending accepted))
  end
end
