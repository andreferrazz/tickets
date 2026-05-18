defmodule Backend.Events.Event do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "events" do
    field :title, :string
    field :description, :string
    field :location, :string
    field :starts_at, :utc_datetime
    field :ends_at, :utc_datetime
    field :cover_image_url, :string
    field :status, :string, default: "draft"
    field :deleted_at, :utc_datetime_usec

    belongs_to :creator, Backend.Accounts.User
    has_many :ticket_types, Backend.Events.TicketType
    has_many :extras, Backend.Events.ExtraItem
    has_many :extra_item_sections, Backend.Events.ExtraItemSection

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(draft published cancelled)

  @doc "Changeset for creating a new event (requires creator_id)."
  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :creator_id,
      :title,
      :description,
      :location,
      :starts_at,
      :ends_at,
      :cover_image_url,
      :status
    ])
    |> validate_required([:creator_id, :title, :starts_at])
    |> validate_inclusion(:status, @valid_statuses)
  end

  @doc "Changeset for updating an existing event (no creator_id change)."
  def update_changeset(event, attrs) do
    event
    |> cast(attrs, [
      :title,
      :description,
      :location,
      :starts_at,
      :ends_at,
      :cover_image_url,
      :status
    ])
    |> validate_required([:title, :starts_at])
    |> validate_inclusion(:status, @valid_statuses)
  end
end
