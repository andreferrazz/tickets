defmodule Backend.Events do
  @moduledoc """
  Event management: CRUD for events, ticket types, and extra items.

  Ownership checks are enforced here: only the event's creator (or an admin)
  may mutate an event or its nested resources.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Events.{Event, ExtraItem, TicketType}

  # ---------------------------------------------------------------------------
  # Events
  # ---------------------------------------------------------------------------

  @doc """
  Returns events visible to `user`, ordered by start time.

  Anonymous (`nil`) and buyers see only published events. Creators
  additionally see their own drafts/cancelled events. Admins see everything.
  """
  def list_events(user \\ nil)

  def list_events(%{role: "admin"}) do
    Repo.all(from e in Event, order_by: [asc: e.starts_at])
  end

  def list_events(%{id: user_id}) do
    Repo.all(
      from e in Event,
        where: e.status == "published" or e.creator_id == ^user_id,
        order_by: [asc: e.starts_at]
    )
  end

  def list_events(nil) do
    Repo.all(from e in Event, where: e.status == "published", order_by: [asc: e.starts_at])
  end

  @doc """
  Returns an event with preloaded ticket_types and extras, or nil.

  Drafts are returned as-is; callers decide whether to expose them.
  """
  def get_event(id) do
    Event
    |> Repo.get(id)
    |> Repo.preload([:ticket_types, :extras])
  end

  @doc "Creates an event owned by `user`."
  def create_event(user, attrs) do
    attrs
    |> Map.put("creator_id", user.id)
    |> Event.changeset()
    |> Repo.insert()
  end

  @doc "Updates `event_id`. Returns `{:error, :forbidden}` if user is not owner/admin."
  def update_event(user, event_id, attrs) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      event |> Event.update_changeset(attrs) |> Repo.update()
    end
  end

  @doc "Deletes `event_id`. Returns `{:error, :forbidden}` if user is not owner/admin."
  def delete_event(user, event_id) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      Repo.delete(event)
    end
  end

  # ---------------------------------------------------------------------------
  # Ticket types
  # ---------------------------------------------------------------------------

  @doc "Creates a ticket type for `event_id`. Checks ownership."
  def create_ticket_type(user, event_id, attrs) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      attrs
      |> Map.put("event_id", event.id)
      |> TicketType.changeset()
      |> Repo.insert()
    end
  end

  @doc "Updates ticket type `id`. Checks ownership."
  def update_ticket_type(user, id, attrs) do
    with {:ok, tt} <- fetch_owned_ticket_type(user, id) do
      tt |> TicketType.update_changeset(attrs) |> Repo.update()
    end
  end

  @doc "Deletes ticket type `id`. Checks ownership."
  def delete_ticket_type(user, id) do
    with {:ok, tt} <- fetch_owned_ticket_type(user, id) do
      Repo.delete(tt)
    end
  end

  # ---------------------------------------------------------------------------
  # Extra items
  # ---------------------------------------------------------------------------

  @doc "Creates an extra item for `event_id`. Checks ownership."
  def create_extra(user, event_id, attrs) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      attrs
      |> Map.put("event_id", event.id)
      |> ExtraItem.changeset()
      |> Repo.insert()
    end
  end

  @doc "Updates extra item `id`. Checks ownership."
  def update_extra(user, id, attrs) do
    with {:ok, extra} <- fetch_owned_extra(user, id) do
      extra |> ExtraItem.update_changeset(attrs) |> Repo.update()
    end
  end

  @doc "Deletes extra item `id`. Checks ownership."
  def delete_extra(user, id) do
    with {:ok, extra} <- fetch_owned_extra(user, id) do
      Repo.delete(extra)
    end
  end

  # ---------------------------------------------------------------------------
  # Private
  # ---------------------------------------------------------------------------

  defp fetch_owned_event(user, event_id) do
    case Repo.get(Event, event_id) do
      nil -> {:error, :not_found}
      event when user.role == "admin" or event.creator_id == user.id -> {:ok, event}
      _event -> {:error, :forbidden}
    end
  end

  defp fetch_owned_ticket_type(user, id) do
    query =
      from tt in TicketType,
        join: e in Event,
        on: tt.event_id == e.id,
        where: tt.id == ^id,
        select: {tt, e}

    case Repo.one(query) do
      nil -> {:error, :not_found}
      {tt, event} when user.role == "admin" or event.creator_id == user.id -> {:ok, tt}
      {_tt, _event} -> {:error, :forbidden}
    end
  end

  defp fetch_owned_extra(user, id) do
    query =
      from ex in ExtraItem,
        join: e in Event,
        on: ex.event_id == e.id,
        where: ex.id == ^id,
        select: {ex, e}

    case Repo.one(query) do
      nil -> {:error, :not_found}
      {extra, event} when user.role == "admin" or event.creator_id == user.id -> {:ok, extra}
      {_extra, _event} -> {:error, :forbidden}
    end
  end
end
