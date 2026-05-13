defmodule Backend.Invitations.Invitation do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # Table will be created in Phase 5 migration.
  # Defined here now so Accounts context can reference it at compile time.
  schema "invitations" do
    field :email, :string
    field :status, :string, default: "pending"
    belongs_to :inviter, Backend.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
