defmodule Backend.Webhooks.Event do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "webhook_events" do
    field :event_type, :string
    field :payload, :map

    timestamps(type: :utc_datetime)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [:event_type, :payload])
    |> validate_required([:payload])
  end
end
