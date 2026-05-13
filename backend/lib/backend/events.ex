defmodule Backend.Events do
  @moduledoc """
  Event management: CRUD for events, ticket types, and extra items.

  Ownership checks are enforced here: only the event's creator (or an admin)
  may mutate an event or its nested resources.

  Deletes are logical: every business resource carries a `deleted_at`
  timestamp and reads filter out rows where it is set. Soft-deleting an
  event cascades the timestamp to its ticket types and extras in the same
  transaction.
  """

  import Ecto.Query
  require Logger
  alias Backend.Repo
  alias Backend.Events.{Event, ExtraItem, TicketType}

  # ---------------------------------------------------------------------------
  # Events
  # ---------------------------------------------------------------------------

  @doc """
  Returns events visible to `user`, ordered by start time.

  Anonymous (`nil`) and buyers see only published events. Creators
  additionally see their own drafts/cancelled events. Admins see everything.
  Soft-deleted events are never returned.
  """
  def list_events(user \\ nil)

  def list_events(%{role: "admin"} = user) do
    Logger.info("list_events", role: "admin", user_id: user.id)
    Repo.all(from e in Event, where: is_nil(e.deleted_at), order_by: [asc: e.starts_at])
  end

  def list_events(%{id: user_id, role: role}) do
    Logger.info("list_events", role: role, user_id: user_id)

    Repo.all(
      from e in Event,
        where:
          is_nil(e.deleted_at) and
            (e.status == "published" or e.creator_id == ^user_id),
        order_by: [asc: e.starts_at]
    )
  end

  def list_events(nil) do
    Logger.info("list_events", role: "anonymous")

    Repo.all(
      from e in Event,
        where: is_nil(e.deleted_at) and e.status == "published",
        order_by: [asc: e.starts_at]
    )
  end

  @doc """
  Returns an event with preloaded ticket_types and extras, or nil.

  Drafts are returned as-is; callers decide whether to expose them.
  Soft-deleted events return nil; soft-deleted children are stripped from
  the preloads.
  """
  def get_event(id) do
    case Repo.one(from e in Event, where: e.id == ^id and is_nil(e.deleted_at)) do
      nil ->
        nil

      event ->
        Repo.preload(event,
          ticket_types: from(t in TicketType, where: is_nil(t.deleted_at)),
          extras: from(x in ExtraItem, where: is_nil(x.deleted_at))
        )
    end
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

  @doc """
  Soft-deletes `event_id` and cascades to its ticket types and extras.

  Returns `{:error, :forbidden}` if user is not owner/admin. The cascade
  only stamps children that are not already soft-deleted, preserving
  their original `deleted_at` if they were removed independently earlier.
  """
  def delete_event(user, event_id) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      now = DateTime.utc_now()

      Repo.transaction(fn ->
        {:ok, event} = soft_delete(event, now)

        Repo.update_all(
          from(t in TicketType, where: t.event_id == ^event.id and is_nil(t.deleted_at)),
          set: [deleted_at: now]
        )

        Repo.update_all(
          from(x in ExtraItem, where: x.event_id == ^event.id and is_nil(x.deleted_at)),
          set: [deleted_at: now]
        )

        event
      end)
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

  @doc "Soft-deletes ticket type `id`. Checks ownership."
  def delete_ticket_type(user, id) do
    with {:ok, tt} <- fetch_owned_ticket_type(user, id) do
      soft_delete(tt, DateTime.utc_now())
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

  @doc "Soft-deletes extra item `id`. Checks ownership."
  def delete_extra(user, id) do
    with {:ok, extra} <- fetch_owned_extra(user, id) do
      soft_delete(extra, DateTime.utc_now())
    end
  end

  # ---------------------------------------------------------------------------
  # Private
  # ---------------------------------------------------------------------------

  defp soft_delete(struct, now) do
    struct
    |> Ecto.Changeset.change(deleted_at: now)
    |> Repo.update()
  end

  defp fetch_owned_event(user, event_id) do
    query = from e in Event, where: e.id == ^event_id and is_nil(e.deleted_at)

    case Repo.one(query) do
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
        where: tt.id == ^id and is_nil(tt.deleted_at) and is_nil(e.deleted_at),
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
        where: ex.id == ^id and is_nil(ex.deleted_at) and is_nil(e.deleted_at),
        select: {ex, e}

    case Repo.one(query) do
      nil -> {:error, :not_found}
      {extra, event} when user.role == "admin" or event.creator_id == user.id -> {:ok, extra}
      {_extra, _event} -> {:error, :forbidden}
    end
  end
end
