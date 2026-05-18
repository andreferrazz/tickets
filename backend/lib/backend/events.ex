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
  alias Backend.Events.{Event, ExtraItem, ExtraItemSection, TicketType}

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
          extra_item_sections:
            {from(s in ExtraItemSection,
               where: is_nil(s.deleted_at),
               order_by: [asc: s.position, asc: s.inserted_at]
             ),
             extras:
               from(x in ExtraItem, where: is_nil(x.deleted_at), order_by: [asc: x.inserted_at])}
        )
    end
  end

  @doc """
  Creates an event owned by `user`. Inserts a default addon section so every
  event satisfies the invariant that it has at least one section.
  """
  def create_event(user, attrs) do
    changeset =
      attrs
      |> Map.put("creator_id", user.id)
      |> Event.changeset()

    Repo.transaction(fn ->
      case Repo.insert(changeset) do
        {:ok, event} ->
          {:ok, _section} = insert_default_section(event.id)
          event

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  defp insert_default_section(event_id) do
    %{"event_id" => event_id, "title" => "Addons", "position" => 0}
    |> ExtraItemSection.changeset()
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

        Repo.update_all(
          from(s in ExtraItemSection,
            where: s.event_id == ^event.id and is_nil(s.deleted_at)
          ),
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
      |> create_with_abacate_product("ticket")
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

  @doc """
  Creates an extra item for `event_id`. Requires a `section_id` (string key)
  that belongs to the same event. Checks ownership.
  """
  def create_extra(user, event_id, attrs) do
    with {:ok, event} <- fetch_owned_event(user, event_id),
         {:ok, attrs} <- resolve_extra_section(event, attrs) do
      attrs
      |> Map.put("event_id", event.id)
      |> ExtraItem.changeset()
      |> create_with_abacate_product("extra")
    end
  end

  # If section_id is omitted, default to the event's earliest live section so
  # creators can add addons without a separate section-create step.
  defp resolve_extra_section(event, attrs) do
    case Map.get(attrs, "section_id") || Map.get(attrs, :section_id) do
      nil ->
        case default_section_id(event.id) do
          nil -> {:error, :section_not_found}
          id -> {:ok, Map.put(attrs, "section_id", id)}
        end

      id ->
        if section_belongs_to_event?(id, event.id),
          do: {:ok, Map.put(attrs, "section_id", id)},
          else: {:error, :section_not_found}
    end
  end

  defp default_section_id(event_id) do
    Repo.one(
      from s in ExtraItemSection,
        where: s.event_id == ^event_id and is_nil(s.deleted_at),
        order_by: [asc: s.position, asc: s.inserted_at],
        limit: 1,
        select: s.id
    )
  end

  defp section_belongs_to_event?(section_id, event_id) do
    Repo.exists?(
      from s in ExtraItemSection,
        where: s.id == ^section_id and s.event_id == ^event_id and is_nil(s.deleted_at)
    )
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
  # Extra item sections
  # ---------------------------------------------------------------------------

  @doc "Creates an addon section for `event_id`. Checks ownership."
  def create_section(user, event_id, attrs) do
    with {:ok, event} <- fetch_owned_event(user, event_id) do
      attrs
      |> Map.put("event_id", event.id)
      |> ExtraItemSection.changeset()
      |> Repo.insert()
    end
  end

  @doc "Updates section `id`. Checks ownership."
  def update_section(user, id, attrs) do
    with {:ok, section} <- fetch_owned_section(user, id) do
      section |> ExtraItemSection.update_changeset(attrs) |> Repo.update()
    end
  end

  @doc """
  Soft-deletes section `id`. Returns `{:error, :section_not_empty}` if the
  section still owns any non-soft-deleted extras — the creator must remove or
  move them first.
  """
  def delete_section(user, id) do
    with {:ok, section} <- fetch_owned_section(user, id) do
      if section_has_live_extras?(section.id),
        do: {:error, :section_not_empty},
        else: soft_delete(section, DateTime.utc_now())
    end
  end

  defp section_has_live_extras?(section_id) do
    Repo.exists?(
      from x in ExtraItem,
        where: x.section_id == ^section_id and is_nil(x.deleted_at)
    )
  end

  defp fetch_owned_section(user, id) do
    query =
      from s in ExtraItemSection,
        join: e in Event,
        on: s.event_id == e.id,
        where: s.id == ^id and is_nil(s.deleted_at) and is_nil(e.deleted_at),
        select: {s, e}

    case Repo.one(query) do
      nil -> {:error, :not_found}
      {section, event} when user.role == "admin" or event.creator_id == user.id -> {:ok, section}
      {_section, _event} -> {:error, :forbidden}
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

  # Inserts `changeset`, creates the matching Abacate Pay product, then writes
  # the returned `prod_*` id back onto the row. Any failure rolls the row back
  # so we never leave a record without a paired upstream product.
  defp create_with_abacate_product(changeset, prefix) do
    Repo.transaction(fn ->
      with {:ok, record} <- Repo.insert(changeset),
           external_id = "#{prefix}_#{record.id}",
           {:ok, prod_id} <-
             abacate_pay().create_product(record.name, record.price_cents, external_id),
           {:ok, record} <-
             record |> Ecto.Changeset.change(abacate_product_id: prod_id) |> Repo.update() do
        record
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp abacate_pay,
    do: Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)
end
