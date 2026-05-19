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
  alias Backend.Accounts.User
  alias Backend.Events.{Event, ExtraItem, ExtraItemSection, TicketBatch, TicketType}
  alias Backend.Orders.{Order, OrderItem}
  alias Backend.Tickets.Pass

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
          ticket_types:
            {from(t in TicketType, where: is_nil(t.deleted_at)),
             batches: from(b in TicketBatch, order_by: [asc: b.sequence])},
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
  # Stats (creator dashboard)
  # ---------------------------------------------------------------------------

  @doc """
  Aggregates sales and check-in stats for `event_id`. Restricted to the event's
  creator (or admin). Returns `{:error, :not_found}` for anyone else — we
  collapse forbidden into not-found so the endpoint can't be used to probe
  ownership.

  The returned map exposes `quantity_sold` figures from `ticket_batches` and
  `extra_items` directly; those columns reflect *reserved + paid* stock since
  reservations decrement on refund/expire but pending orders still hold the
  rows. Revenue, by contrast, only sums orders in `status = "paid"`.
  """
  def event_stats(user, event_id) do
    case fetch_owned_event(user, event_id) do
      {:ok, event} ->
        event = preload_for_stats(event)

        {:ok,
         %{
           event_id: event.id,
           totals: totals_for(event),
           ticket_types: ticket_type_stats(event),
           extras: extra_stats(event),
           recent_orders: recent_orders(event.id)
         }}

      {:error, _} ->
        {:error, :not_found}
    end
  end

  defp preload_for_stats(event) do
    Repo.preload(event,
      ticket_types:
        {from(t in TicketType, where: is_nil(t.deleted_at), order_by: [asc: t.inserted_at]),
         batches: from(b in TicketBatch, order_by: [asc: b.sequence])},
      extra_item_sections:
        {from(s in ExtraItemSection, where: is_nil(s.deleted_at), order_by: [asc: s.position]),
         extras:
           from(x in ExtraItem, where: is_nil(x.deleted_at), order_by: [asc: x.inserted_at])}
    )
  end

  defp totals_for(event) do
    %{paid: paid_orders, pending: pending_orders, revenue: revenue} = order_totals(event.id)
    %{issued: passes_issued, checked_in: checked_in} = pass_totals(event.id)
    {tickets_sold, tickets_capacity} = ticket_capacity(event)
    extras_sold = Enum.sum(for s <- event.extra_item_sections, x <- s.extras, do: x.quantity_sold)

    %{
      orders_paid: paid_orders,
      orders_pending: pending_orders,
      revenue_cents: revenue,
      tickets_sold: tickets_sold,
      tickets_capacity: tickets_capacity,
      extras_sold: extras_sold,
      passes_issued: passes_issued,
      passes_checked_in: checked_in
    }
  end

  defp order_totals(event_id) do
    rows =
      Repo.all(
        from o in Order,
          where: o.event_id == ^event_id,
          group_by: o.status,
          select: {o.status, count(o.id), sum(o.total_cents)}
      )

    Enum.reduce(rows, %{paid: 0, pending: 0, revenue: 0}, fn
      {"paid", count, sum}, acc -> %{acc | paid: count, revenue: acc.revenue + (sum || 0)}
      {"pending", count, _sum}, acc -> %{acc | pending: count}
      _, acc -> acc
    end)
  end

  defp pass_totals(event_id) do
    {issued, checked_in} =
      Repo.one(
        from p in Pass,
          where: p.event_id == ^event_id,
          select: {count(p.id), count(p.checked_in_at)}
      )

    %{issued: issued || 0, checked_in: checked_in || 0}
  end

  defp ticket_capacity(event) do
    Enum.reduce(event.ticket_types, {0, 0}, fn tt, {sold, capacity} ->
      tt_sold = Enum.sum(Enum.map(tt.batches, & &1.quantity_sold))
      tt_cap = Enum.sum(Enum.map(tt.batches, & &1.quantity_total))
      {sold + tt_sold, capacity + tt_cap}
    end)
  end

  defp ticket_type_stats(event) do
    paid_revenue = paid_revenue_by_item("ticket", event.id)

    Enum.map(event.ticket_types, fn tt ->
      %{
        id: tt.id,
        name: tt.name,
        sold: Enum.sum(Enum.map(tt.batches, & &1.quantity_sold)),
        capacity: Enum.sum(Enum.map(tt.batches, & &1.quantity_total)),
        revenue_cents: Map.get(paid_revenue, tt.id, 0),
        batches: Enum.map(tt.batches, &batch_stat/1)
      }
    end)
  end

  defp batch_stat(b) do
    %{
      id: b.id,
      sequence: b.sequence,
      label: "Lote #{b.sequence}",
      sold: b.quantity_sold,
      capacity: b.quantity_total,
      price_cents: b.price_cents,
      closed_at: b.closed_at
    }
  end

  defp extra_stats(event) do
    paid_revenue = paid_revenue_by_item("extra", event.id)

    for section <- event.extra_item_sections, x <- section.extras do
      %{
        id: x.id,
        name: x.name,
        section_title: section.title,
        sold: x.quantity_sold,
        capacity: x.quantity_total,
        revenue_cents: Map.get(paid_revenue, x.id, 0)
      }
    end
  end

  # Sums quantity * unit_price_cents from paid order_items grouped by item_id.
  # We only count rows where the parent order is `paid` — pending stock holds
  # don't generate revenue, and refunded orders shouldn't either.
  defp paid_revenue_by_item(item_type, event_id) do
    rows =
      Repo.all(
        from oi in OrderItem,
          join: o in Order,
          on: oi.order_id == o.id,
          where:
            o.event_id == ^event_id and o.status == "paid" and oi.item_type == ^item_type,
          group_by: oi.item_id,
          select: {oi.item_id, sum(oi.quantity * oi.unit_price_cents)}
      )

    Map.new(rows, fn {id, sum} -> {id, sum || 0} end)
  end

  @doc """
  Returns the buyers of a single extra item, one row per user, with summed
  `quantity` across their orders. Restricted to the event's creator (or admin)
  — non-owners get `:not_found` to avoid leaking existence.

  Includes both `pending` and `paid` orders, matching the `quantity_sold`
  column shown on the dashboard card (refunded/expired orders are excluded
  because those statuses already decremented `quantity_sold`).
  """
  def list_extra_buyers(user, extra_id) do
    case fetch_owned_extra(user, extra_id) do
      {:ok, extra} -> {:ok, query_extra_buyers(extra.id)}
      {:error, _} -> {:error, :not_found}
    end
  end

  defp query_extra_buyers(extra_id) do
    Repo.all(
      from oi in OrderItem,
        join: o in Order,
        on: oi.order_id == o.id,
        join: u in User,
        on: o.user_id == u.id,
        where:
          oi.item_type == "extra" and oi.item_id == ^extra_id and
            o.status in ["pending", "paid"],
        group_by: [u.id, u.name, u.tax_id, u.email],
        order_by: [desc: sum(oi.quantity), asc: u.name],
        select: %{
          name: u.name,
          tax_id: u.tax_id,
          email: u.email,
          quantity: sum(oi.quantity)
        }
    )
  end

  defp recent_orders(event_id) do
    Repo.all(
      from o in Order,
        join: u in User,
        on: o.user_id == u.id,
        left_join: oi in OrderItem,
        on: oi.order_id == o.id,
        where: o.event_id == ^event_id,
        group_by: [o.id, u.email],
        order_by: [desc: o.inserted_at],
        limit: 10,
        select: %{
          id: o.id,
          buyer_email: u.email,
          status: o.status,
          total_cents: o.total_cents,
          paid_at: o.paid_at,
          inserted_at: o.inserted_at,
          item_count: coalesce(sum(oi.quantity), 0)
        }
    )
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

  @doc "Returns ticket type `id` with batches preloaded by sequence (or nil)."
  def get_ticket_type(id) do
    Repo.one(
      from t in TicketType,
        where: t.id == ^id and is_nil(t.deleted_at),
        preload: [batches: ^from(b in TicketBatch, order_by: [asc: b.sequence])]
    )
  end

  # ---------------------------------------------------------------------------
  # Ticket batches (lotes)
  # ---------------------------------------------------------------------------

  @doc """
  Returns the active batch for `ticket_type` (lowest sequence with no
  `closed_at`), or `nil` if all batches are closed. Accepts either a
  ticket_type struct with `:batches` preloaded or a struct with just an id.
  """
  def active_batch(%TicketType{batches: %Ecto.Association.NotLoaded{}} = tt) do
    active_batch_query(tt.id)
  end

  def active_batch(%TicketType{batches: batches}) when is_list(batches) do
    batches
    |> Enum.sort_by(& &1.sequence)
    |> Enum.find(&is_nil(&1.closed_at))
  end

  def active_batch(%TicketType{id: id}), do: active_batch_query(id)

  defp active_batch_query(ticket_type_id) do
    Repo.one(
      from b in TicketBatch,
        where: b.ticket_type_id == ^ticket_type_id and is_nil(b.closed_at),
        order_by: [asc: b.sequence],
        limit: 1
    )
  end

  @doc ~S"""
  Creates a new batch (lote) on `ticket_type_id`. The sequence is auto-assigned
  as the next integer after the highest existing sequence — labels in the UI
  are `"Lote #{sequence}"`. Creates a dedicated Abacate Pay product for the
  batch since each batch has its own price.
  """
  def create_batch(user, ticket_type_id, attrs) do
    with {:ok, tt} <- fetch_owned_ticket_type(user, ticket_type_id) do
      next_seq = next_batch_sequence(tt.id)

      attrs
      |> Map.put("ticket_type_id", tt.id)
      |> Map.put("sequence", next_seq)
      |> TicketBatch.create_changeset()
      |> create_batch_with_abacate_product(tt)
    end
  end

  defp next_batch_sequence(ticket_type_id) do
    current =
      Repo.one(
        from b in TicketBatch,
          where: b.ticket_type_id == ^ticket_type_id,
          select: max(b.sequence)
      )

    (current || 0) + 1
  end

  @doc "Updates a batch's price or capacity. Checks ownership via ticket type."
  def update_batch(user, batch_id, attrs) do
    with {:ok, batch} <- fetch_owned_batch(user, batch_id) do
      batch |> TicketBatch.update_changeset(attrs) |> Repo.update()
    end
  end

  @doc """
  Manually closes `batch_id`. Idempotent on already-closed batches. Marks the
  closure as manual (not `auto_closed`) so a subsequent refund will not
  re-open it — the creator's close is sticky.
  """
  def close_batch(user, batch_id) do
    with {:ok, batch} <- fetch_owned_batch(user, batch_id) do
      if batch.closed_at do
        {:ok, batch}
      else
        batch
        |> Ecto.Changeset.change(
          closed_at: DateTime.utc_now() |> DateTime.truncate(:second),
          auto_closed: false
        )
        |> Repo.update()
      end
    end
  end

  @doc """
  Hard-deletes `batch_id` if no tickets have been sold from it. Returns
  `{:error, :batch_has_sales}` otherwise — historical orders must stay
  resolvable to a batch row.
  """
  def delete_batch(user, batch_id) do
    with {:ok, batch} <- fetch_owned_batch(user, batch_id) do
      if batch.quantity_sold > 0,
        do: {:error, :batch_has_sales},
        else: Repo.delete(batch)
    end
  end

  defp fetch_owned_batch(user, id) do
    query =
      from b in TicketBatch,
        join: tt in TicketType,
        on: b.ticket_type_id == tt.id,
        join: e in Event,
        on: tt.event_id == e.id,
        where: b.id == ^id and is_nil(tt.deleted_at) and is_nil(e.deleted_at),
        select: {b, e}

    case Repo.one(query) do
      nil -> {:error, :not_found}
      {batch, event} when user.role == "admin" or event.creator_id == user.id -> {:ok, batch}
      {_batch, _event} -> {:error, :forbidden}
    end
  end

  # Inserts the batch, then creates its Abacate Pay product and writes the
  # returned `prod_*` id back. Any failure rolls the row back so we never leave
  # a batch without a paired upstream product.
  #
  # Free batches (price_cents == 0) skip the Abacate product entirely — the
  # upstream API rejects zero-priced products, and the order flow has its own
  # free-line handling that excludes such lines from the checkout payload.
  defp create_batch_with_abacate_product(changeset, ticket_type) do
    Repo.transaction(fn ->
      with {:ok, batch} <- Repo.insert(changeset),
           {:ok, batch} <- maybe_attach_abacate_product(batch, ticket_type) do
        batch
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp maybe_attach_abacate_product(%TicketBatch{price_cents: 0} = batch, _ticket_type),
    do: {:ok, batch}

  defp maybe_attach_abacate_product(batch, ticket_type) do
    label = "#{ticket_type.name} - Lote #{batch.sequence}"
    external_id = "batch_#{batch.id}"

    with {:ok, prod_id} <- abacate_pay().create_product(label, batch.price_cents, external_id) do
      batch |> Ecto.Changeset.change(abacate_product_id: prod_id) |> Repo.update()
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
  #
  # Free records (price_cents == 0) skip the Abacate product — the upstream
  # API rejects zero-priced products, and the order flow's checkout payload
  # already filters out zero-priced lines.
  defp create_with_abacate_product(changeset, prefix) do
    Repo.transaction(fn ->
      with {:ok, record} <- Repo.insert(changeset),
           {:ok, record} <- attach_abacate_product_unless_free(record, prefix) do
        record
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp attach_abacate_product_unless_free(%{price_cents: 0} = record, _prefix), do: {:ok, record}

  defp attach_abacate_product_unless_free(record, prefix) do
    external_id = "#{prefix}_#{record.id}"

    with {:ok, prod_id} <- abacate_pay().create_product(record.name, record.price_cents, external_id) do
      record |> Ecto.Changeset.change(abacate_product_id: prod_id) |> Repo.update()
    end
  end

  defp abacate_pay,
    do: Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)
end
