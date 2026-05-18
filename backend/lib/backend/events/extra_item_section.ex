defmodule Backend.Events.ExtraItemSection do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "extra_item_sections" do
    field :title, :string
    field :description, :string
    field :position, :integer, default: 0
    field :deleted_at, :utc_datetime_usec

    belongs_to :event, Backend.Events.Event
    has_many :extras, Backend.Events.ExtraItem, foreign_key: :section_id

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:event_id, :title, :description, :position])
    |> validate_required([:event_id, :title])
    |> validate_length(:title, max: 255)
  end

  def update_changeset(section, attrs) do
    section
    |> cast(attrs, [:title, :description, :position])
    |> validate_required([:title])
    |> validate_length(:title, max: 255)
  end
end
