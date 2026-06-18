defmodule Backend.Organizations.Membership do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "organization_memberships" do
    field :role, :string

    belongs_to :organization, Backend.Organizations.Organization
    belongs_to :user, Backend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @valid_roles ~w(leader participant staff)

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:organization_id, :user_id, :role])
    |> validate_required([:organization_id, :user_id, :role])
    |> validate_inclusion(:role, @valid_roles)
    |> unique_constraint([:organization_id, :user_id])
    |> unique_constraint(:role,
      name: :organization_memberships_one_leader_index,
      message: "organization already has a leader"
    )
  end

  def role_changeset(membership, new_role) do
    membership
    |> cast(%{role: new_role}, [:role])
    |> validate_inclusion(:role, @valid_roles)
    |> unique_constraint(:role,
      name: :organization_memberships_one_leader_index,
      message: "organization already has a leader"
    )
  end
end
