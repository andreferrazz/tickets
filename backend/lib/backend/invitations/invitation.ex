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
    field :role, :string

    belongs_to :inviter, Backend.Accounts.User
    belongs_to :organization, Backend.Organizations.Organization

    timestamps(type: :utc_datetime, updated_at: false)
  end

  @valid_statuses ~w(pending accepted expired)
  @valid_roles ~w(leader participant)

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :inviter_id,
      :organization_id,
      :role,
      :email,
      :status,
      :token,
      :expires_at
    ])
    |> validate_required([:inviter_id, :organization_id, :role, :email, :token, :expires_at])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:role, @valid_roles)
    |> unique_constraint(:token)
  end
end
