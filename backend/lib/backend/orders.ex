defmodule Backend.Orders do
  @moduledoc """
  Order management: creation with stock reservation, listing, and webhook callbacks.

  The Abacate Pay client module is configurable via `:abacate_pay_module` so
  tests can inject a stub without HTTP calls.
  """

  import Ecto.Query
  require Logger
  alias Backend.Repo
  alias Backend.Events
  alias Backend.Events.{Event, ExtraItem, Seating, TicketBatch}
  alias Backend.Orders.{Order, OrderItem}
  alias Backend.Organizations
  alias Backend.Tickets

  @valid_statuses ~w(pending paid expired refunded cancelled)

  # ---------------------------------------------------------------------------
  # Create
  # ---------------------------------------------------------------------------

  @doc """
  Creates an order for `user` on `event_id` with the given `cart_items`.

  Steps:
    1. Resolve and validate each item (stock check, price snapshot).
    2. Open a DB transaction: reserve stock, insert order + items.
    3. Create Abacate Pay checkout from the items' existing product ids,
       store the bill_id and payment URL.

  Returns `{:ok, order}` or `{:error, reason}`.
  """
  def create_order(user, event_id, cart_items, seat_picks \\ [], payment_method \\ nil) do
    with {:ok, event} <- fetch_published_event(event_id),
         {:ok, line_items} <- resolve_items(event, cart_items),
         :ok <- ensure_extras_within_ticket_count(line_items),
         {:ok, picks} <- Seating.validate_picks(event, seat_picks, ticket_quantity(line_items)),
         total = compute_total(line_items),
         {:ok, order} <- reserve_order(user, event, total, line_items, picks) do
      finalize_order(user, event, total, line_items, order, payment_method)
    end
  end

  # When an extra is flagged `limit_to_ticket_count`, the buyer can purchase at
  # most one per ticket in the same order (across all ticket types). Capped
  # extras that exceed the order's ticket count get rejected before stock is
  # reserved.
  defp ensure_extras_within_ticket_count(line_items) do
    ticket_count = ticket_quantity(line_items)

    case Enum.find(line_items, fn line ->
           line.type == "extra" and Map.get(line, :limit_to_ticket_count, false) and
             line.quantity > ticket_count
         end) do
      nil -> :ok
      bad -> {:error, {:extra_exceeds_tickets, bad.name, bad.quantity, ticket_count}}
    end
  end

  defp ticket_quantity(line_items) do
    line_items
    |> Enum.filter(&(&1.type == "ticket"))
    |> Enum.reduce(0, fn line, acc -> acc + line.quantity end)
  end

  # Free orders (total == 0) skip Abacate Pay entirely — there's nothing to
  # charge — and are marked paid + fulfilled inline. Paid orders go through
  # the usual checkout-then-webhook path.
  defp finalize_order(_user, event, 0, _line_items, order, _payment_method) do
    with {:ok, paid} <- mark_free_order_paid(order),
         {:ok, paid, _passes} <- fulfill_paid_order(%{paid | event_title: event.title}) do
      {:ok, paid}
    else
      {:error, reason} ->
        cancel_order(order)
        {:error, reason}
    end
  end

  defp finalize_order(user, event, total, line_items, order, payment_method) do
    case build_checkout(order, line_items, user, total, payment_method) do
      {:ok, checkout} ->
        {:ok, attach_checkout(order, event, checkout, payment_method)}

      {:error, reason} ->
        cancel_order(order)
        {:error, reason}
    end
  end

  defp mark_free_order_paid(order) do
    order
    |> Ecto.Changeset.change(
      status: "paid",
      paid_at: DateTime.utc_now() |> DateTime.truncate(:second)
    )
    |> Repo.update()
  end

  @doc """
  Issues passes for a paid order and emails them to the buyer. Called by the
  webhook handler after Abacate confirms payment, and by `create_order/3` for
  free orders that skip the checkout entirely.

  Idempotent: re-running on an order that already has passes returns them
  with status `:existed` and skips the email send, matching the
  webhook-replay safety the old in-controller orchestration provided.
  """
  def fulfill_paid_order(order) do
    order = order |> Repo.preload([:user, :items]) |> ensure_event_title()

    with {:ok, passes, status} <- Tickets.issue_for_order(order) do
      if status == :created, do: deliver_pass_emails(order, passes)
      {:ok, order, passes}
    end
  end

  defp ensure_event_title(%Order{event_title: title} = order) when is_binary(title), do: order
  defp ensure_event_title(order), do: with_event_title(order)

  defp deliver_pass_emails(order, passes) do
    {ticket_passes, extra_passes} = Enum.split_with(passes, &(&1.kind == "ticket"))
    Backend.Mailer.send_tickets_email(order.user.email, order, ticket_passes)

    case extra_passes do
      [extra_pass | _] ->
        extras_items = Enum.filter(order.items, &(&1.item_type == "extra"))
        Backend.Mailer.send_extras_email(order.user.email, order, extra_pass, extras_items)

      [] ->
        :ok
    end
  end

  # ---------------------------------------------------------------------------
  # Query
  # ---------------------------------------------------------------------------

  @doc """
  Lists orders for `event_id`, newest first, with items, buyer, and passes
  preloaded. Passes feed the validated/total ticket count in the orders view.

  Authorization: `user` must be an admin or a manager (leader or participant,
  see `Organizations.can_manage?/2`) of the event's organization. Scan-only
  `staff` members and outsiders are denied. Returns `{:error, :not_found}` for
  denied users and for missing events alike, to avoid leaking event existence.

  `statuses` is an optional list filtering on `Order.status`. When empty or
  nil, all statuses are returned. Unknown values short-circuit the query and
  return `{:error, {:invalid_status, value}}`.
  """
  def list_event_orders(user, event_id, statuses \\ nil) do
    with {:ok, normalized} <- normalize_statuses(statuses),
         {:ok, event} <- authorize_event(user, event_id) do
      {:ok, query_event_orders(event.id, normalized)}
    end
  end

  defp normalize_statuses(nil), do: {:ok, []}
  defp normalize_statuses([]), do: {:ok, []}

  defp normalize_statuses(values) when is_list(values) do
    Enum.reduce_while(values, {:ok, []}, fn value, {:ok, acc} ->
      case value do
        s when s in @valid_statuses -> {:cont, {:ok, [s | acc]}}
        bad -> {:halt, {:error, {:invalid_status, bad}}}
      end
    end)
  end

  defp normalize_statuses(other), do: {:error, {:invalid_status, other}}

  defp authorize_event(%{role: "admin"}, event_id) do
    case Repo.one(from e in Event, where: e.id == ^event_id and is_nil(e.deleted_at)) do
      nil -> {:error, :not_found}
      event -> {:ok, event}
    end
  end

  defp authorize_event(%{id: user_id}, event_id) do
    case Repo.one(from e in Event, where: e.id == ^event_id and is_nil(e.deleted_at)) do
      nil ->
        {:error, :not_found}

      event ->
        if Organizations.can_manage?(user_id, event.organization_id),
          do: {:ok, event},
          else: {:error, :not_found}
    end
  end

  defp query_event_orders(event_id, statuses) do
    base =
      from o in Order,
        where: o.event_id == ^event_id,
        order_by: [desc: o.inserted_at]

    base
    |> filter_by_status(statuses)
    |> Repo.all()
    |> Repo.preload([:items, :user, :passes])
  end

  defp filter_by_status(query, []), do: query
  defp filter_by_status(query, statuses), do: from(o in query, where: o.status in ^statuses)

  @doc "Returns all orders for `user`, newest first, with items and event title."
  def list_orders(user) do
    results =
      Repo.all(
        from(o in Order,
          join: e in Event,
          on: o.event_id == e.id,
          where: o.user_id == ^user.id,
          order_by: [desc: o.inserted_at],
          select: {o, e.title}
        )
      )

    orders = Enum.map(results, fn {o, title} -> %{o | event_title: title} end)
    Repo.preload(orders, :items)
  end

  @doc """
  Populates `event_title` on `order` by joining the events table. Returns the
  order unchanged when the event cannot be found (defensive; should not happen
  in practice since orders FK to events).
  """
  def with_event_title(%Order{event_id: event_id} = order) do
    case Repo.one(from(e in Event, where: e.id == ^event_id, select: e.title)) do
      nil -> order
      title -> %{order | event_title: title}
    end
  end

  @doc "Returns a single order belonging to `user`, or `{:error, :not_found}`."
  def get_order(user, order_id) do
    result =
      Repo.one(
        from(o in Order,
          join: e in Event,
          on: o.event_id == e.id,
          where: o.id == ^order_id and o.user_id == ^user.id,
          select: {o, e.title}
        )
      )

    case result do
      nil -> {:error, :not_found}
      {order, title} -> {:ok, order |> Map.put(:event_title, title) |> Repo.preload(:items)}
    end
  end

  # ---------------------------------------------------------------------------
  # Cancel (buyer-initiated)
  # ---------------------------------------------------------------------------

  @doc """
  Cancels `user`'s order `order_id`, releasing the reserved stock.

  Only orders where no payment was actually collected may be cancelled:

    * Free orders (`total_cents == 0`) — created already `paid` with passes
      issued inline. Their passes are deleted so the QR tokens stop validating.
    * Pending paid-orders — cancellable only after Abacate Pay confirms the
      checkout is not paid, closing the window where the buyer paid but the
      `checkout.completed` webhook hasn't landed yet. If Abacate reports it
      paid, the order is recovered (marked paid + fulfilled) instead and
      cancellation is refused.

  Returns `{:ok, cancelled_order}` or `{:error, reason}` where reason is one of
  `:not_found`, `:not_cancellable`, `:already_paid`, `:payment_check_failed`.
  """
  def cancel_order(user, order_id) do
    with {:ok, order} <- get_order(user, order_id) do
      cancel_owned_order(order)
    end
  end

  @doc """
  Cancels `order_id` on behalf of an event manager (admin, or a leader/
  participant of the event's organization — see `Organizations.can_manage?/2`).

  Applies the same cancellability rules as `cancel_order/2` (free orders and
  Abacate-confirmed-unpaid pending orders only). Returns `{:ok, order}` with
  `:items`, `:user`, and `:passes` preloaded for the event-orders view, or the
  same `{:error, ...}` reasons as `cancel_order/2`.
  """
  def cancel_event_order(user, order_id) do
    with {:ok, order} <- fetch_manageable_order(user, order_id),
         {:ok, cancelled} <- cancel_owned_order(order) do
      {:ok, Repo.preload(cancelled, [:items, :user, :passes], force: true)}
    end
  end

  defp fetch_manageable_order(user, order_id) do
    case Repo.one(from(o in Order, where: o.id == ^order_id, preload: :items)) do
      nil -> {:error, :not_found}
      order -> authorize_order_manager(user, order)
    end
  end

  defp authorize_order_manager(%{role: "admin"}, order), do: {:ok, order}

  defp authorize_order_manager(%{id: user_id}, order) do
    case Repo.get(Event, order.event_id) do
      %Event{organization_id: org_id} ->
        if Organizations.can_manage?(user_id, org_id),
          do: {:ok, order},
          else: {:error, :not_found}

      _ ->
        {:error, :not_found}
    end
  end

  defp cancel_owned_order(%Order{status: "paid", total_cents: 0} = order) do
    cancel_and_release(order, delete_passes?: true)
  end

  defp cancel_owned_order(%Order{status: "pending"} = order) do
    case confirm_unpaid(order) do
      :unpaid -> cancel_and_release(order, delete_passes?: false)
      {:paid, info} -> recover_and_refuse(order, info)
      :error -> {:error, :payment_check_failed}
    end
  end

  defp cancel_owned_order(%Order{}), do: {:error, :not_cancellable}

  # Asks Abacate Pay whether the pending checkout is actually paid. Mirrors the
  # method split used by ExpiryWorker (boleto -> transparent endpoint). A nil
  # checkout id (never reached the provider) is treated as unpaid. Upstream
  # failures surface as `:error` so we never cancel a possibly-paid order.
  defp confirm_unpaid(%Order{abacate_checkout_id: nil}), do: :unpaid

  defp confirm_unpaid(%Order{payment_method: "BOLETO"} = order) do
    interpret_upstream(abacate_pay().get_transparent(order.abacate_checkout_id))
  end

  defp confirm_unpaid(order) do
    interpret_upstream(abacate_pay().get_checkout(order.abacate_checkout_id))
  end

  defp interpret_upstream({:ok, %{status: "paid"} = info}), do: {:paid, info}
  defp interpret_upstream({:ok, %{status: _}}), do: :unpaid
  defp interpret_upstream({:error, _reason}), do: :error

  # The buyer paid in the gap before the webhook arrived: recover the order
  # (mark paid + fulfil) the same way ExpiryWorker does, then refuse the
  # cancellation. Recovery failures are logged but still refuse — Abacate is
  # authoritative that money was collected.
  defp recover_and_refuse(order, info) do
    case recover_paid(order, info) do
      :ok ->
        :ok

      {:error, reason} ->
        Logger.warning(
          "cancel_order: recovery of paid order=#{order.id} failed: #{inspect(reason)}"
        )
    end

    {:error, :already_paid}
  end

  defp recover_paid(order, info) do
    with {:ok, paid} <- mark_paid_by_checkout(order.abacate_checkout_id, info),
         {:ok, _order, _passes} <- fulfill_paid_order(paid) do
      :ok
    end
  end

  # Flips status to "cancelled" and releases the reserved stock (ticket batches,
  # extras, seat assignments). Free orders additionally have their issued passes
  # deleted. Wrapped in a transaction so partial state can't leak on failure.
  defp cancel_and_release(order, opts) do
    delete_passes? = Keyword.fetch!(opts, :delete_passes?)
    order = Repo.preload(order, :items)

    Repo.transaction(fn ->
      updated =
        order
        |> Ecto.Changeset.change(status: "cancelled")
        |> Repo.update!()

      release_order_stock(order)
      if delete_passes?, do: Tickets.delete_for_order(order)
      updated
    end)
  end

  # ---------------------------------------------------------------------------
  # Webhook callbacks
  # ---------------------------------------------------------------------------

  @doc """
  Marks order as paid when Abacate Pay sends checkout.completed.

  `payment_info` may carry `:payment_method` (`"PIX"` or `"CARD"`) and, for
  cards, `:card_installments`. Both are optional — when the webhook payload
  doesn't include them, the columns stay nil and downstream fee math falls
  back to the PIX assumption.
  """
  def mark_paid_by_checkout(checkout_id, payment_info \\ %{}) do
    case find_order_by_checkout(checkout_id) do
      nil ->
        {:error, :not_found}

      order ->
        order
        |> Ecto.Changeset.change(
          [status: "paid", paid_at: DateTime.utc_now() |> DateTime.truncate(:second)] ++
            payment_changes(payment_info)
        )
        |> Repo.update()
    end
  end

  defp payment_changes(info) when is_map(info) do
    method = Map.get(info, :payment_method) || Map.get(info, "payment_method")
    installments = Map.get(info, :card_installments) || Map.get(info, "card_installments")
    fee = Map.get(info, :platform_fee_cents) || Map.get(info, "platform_fee_cents")

    []
    |> maybe_set(:payment_method, normalize_method(method))
    |> maybe_set(:card_installments, normalize_positive_int(installments))
    |> maybe_set(:platform_fee_cents, normalize_non_negative_int(fee))
  end

  defp payment_changes(_), do: []

  defp maybe_set(kw, _key, nil), do: kw
  defp maybe_set(kw, key, value), do: kw ++ [{key, value}]

  defp normalize_method(m) when is_binary(m) do
    case String.upcase(m) do
      "PIX" -> "PIX"
      "CARD" -> "CARD"
      _ -> nil
    end
  end

  defp normalize_method(_), do: nil

  defp normalize_positive_int(n) when is_integer(n) and n > 0, do: n
  defp normalize_positive_int(_), do: nil

  defp normalize_non_negative_int(n) when is_integer(n) and n >= 0, do: n
  defp normalize_non_negative_int(_), do: nil

  @doc "Marks order as refunded and releases reserved stock."
  def mark_refunded_by_checkout(checkout_id) do
    case find_order_by_checkout(checkout_id) do
      nil ->
        {:error, :not_found}

      order ->
        Repo.transaction(fn ->
          {:ok, updated} =
            order
            |> Ecto.Changeset.change(status: "refunded")
            |> Repo.update()

          release_order_stock(order)
          updated
        end)
    end
  end

  # ---------------------------------------------------------------------------
  # Expiry (called by ExpiryWorker periodically)
  # ---------------------------------------------------------------------------

  @doc """
  Returns pending orders whose `inserted_at` is older than `expiry_minutes`.

  The reconciler consults Abacate Pay per-order to decide what to do next
  (fulfil if paid, expire otherwise), so this only narrows the candidate set.
  Items are preloaded since callers will release stock.
  """
  def list_stale_pending_orders(expiry_minutes) do
    cutoff = DateTime.add(DateTime.utc_now(), -expiry_minutes * 60, :second)

    Repo.all(
      from(o in Order,
        where: o.status == "pending" and o.inserted_at < ^cutoff,
        preload: :items
      )
    )
  end

  @doc """
  Marks `order` as expired and releases the stock it had reserved. Wrapped
  in a transaction so partial state can't leak when stock release fails.
  Idempotent enough for the worker's purposes: re-running on an already
  expired order is a no-op stock-wise (release on a released order
  decrements quantity_sold by zero net for the second call) but the status
  update will succeed regardless — callers should pass pending orders.
  """
  def mark_expired(%Order{} = order) do
    order = Repo.preload(order, :items)

    Repo.transaction(fn ->
      updated =
        order
        |> Ecto.Changeset.change(status: "expired")
        |> Repo.update!()

      release_order_stock(order)
      updated
    end)
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp fetch_published_event(event_id) do
    case Repo.one(from(e in Event, where: e.id == ^event_id and is_nil(e.deleted_at))) do
      nil -> {:error, :event_not_found}
      %Event{status: "published"} = event -> {:ok, event}
      _event -> {:error, :event_not_available}
    end
  end

  defp resolve_items(_event, []), do: {:error, :no_items}

  defp resolve_items(event, cart_items) do
    Enum.reduce_while(cart_items, {:ok, []}, fn line, {:ok, acc} ->
      case resolve_line(event, line) do
        {:ok, resolved} -> {:cont, {:ok, acc ++ [resolved]}}
        {:error, _} = err -> {:halt, err}
      end
    end)
  end

  defp resolve_line(event, %{"item_type" => "ticket", "item_id" => id, "quantity" => qty})
       when is_integer(qty) and qty > 0 do
    tt = Events.get_ticket_type(id)

    cond do
      is_nil(tt) or tt.event_id != event.id ->
        {:error, {:invalid_item, id}}

      true ->
        resolve_ticket_batch(tt, qty)
    end
  end

  defp resolve_line(event, %{"item_type" => "extra", "item_id" => id, "quantity" => qty})
       when is_integer(qty) and qty > 0 do
    ex = Repo.one(from(x in ExtraItem, where: x.id == ^id and is_nil(x.deleted_at)))

    cond do
      is_nil(ex) or ex.event_id != event.id ->
        {:error, {:invalid_item, id}}

      not is_nil(ex.quantity_total) and ex.quantity_total - ex.quantity_sold < qty ->
        {:error, {:out_of_stock, ex.name}}

      true ->
        {:ok,
         %{
           type: "extra",
           item_id: ex.id,
           batch_id: nil,
           name: ex.name,
           price_cents: ex.price_cents,
           abacate_product_id: ex.abacate_product_id,
           quantity: qty,
           limit_to_ticket_count: ex.limit_to_ticket_count
         }}
    end
  end

  defp resolve_line(_event, line), do: {:error, {:invalid_line, inspect(line)}}

  defp resolve_ticket_batch(tt, qty) do
    case Events.active_batch(tt) do
      nil ->
        {:error, {:out_of_stock, tt.name}}

      batch ->
        if batch.quantity_total - batch.quantity_sold < qty do
          {:error, {:out_of_stock, tt.name}}
        else
          {:ok,
           %{
             type: "ticket",
             item_id: tt.id,
             batch_id: batch.id,
             name: tt.name,
             price_cents: batch.price_cents,
             abacate_product_id: batch.abacate_product_id,
             quantity: qty
           }}
        end
    end
  end

  defp compute_total(line_items) do
    Enum.reduce(line_items, 0, fn %{price_cents: p, quantity: q}, acc -> acc + p * q end)
  end

  defp reserve_order(user, event, total, line_items, seat_picks) do
    Repo.transaction(fn ->
      order =
        %{user_id: user.id, event_id: event.id, total_cents: total}
        |> Order.changeset()
        |> Repo.insert!()

      ticket_items =
        Enum.map(line_items, fn line ->
          item =
            %{
              "order_id" => order.id,
              "item_type" => line.type,
              "item_id" => line.item_id,
              "batch_id" => line.batch_id,
              "item_name" => line.name,
              "quantity" => line.quantity,
              "unit_price_cents" => line.price_cents
            }
            |> OrderItem.changeset()
            |> Repo.insert!()

          increment_sold(line)

          {line, item}
        end)
        |> Enum.filter(fn {line, _} -> line.type == "ticket" end)
        |> Enum.map(fn {_, item} -> item end)

      try do
        Seating.reserve!(event, seat_picks, order, ticket_items)
      rescue
        e in Postgrex.Error ->
          case e do
            %Postgrex.Error{postgres: %{constraint: "seat_assignments_active_uniq"}} ->
              Repo.rollback({:seat_taken, seat_picks})

            other ->
              reraise other, __STACKTRACE__
          end
      end

      order
    end)
  end

  defp increment_sold(%{type: "ticket", batch_id: batch_id, quantity: qty}) do
    {1, [batch]} =
      Repo.update_all(
        from(b in TicketBatch, where: b.id == ^batch_id, select: b),
        inc: [quantity_sold: qty]
      )

    if batch.quantity_sold >= batch.quantity_total and is_nil(batch.closed_at) do
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      Repo.update_all(
        from(b in TicketBatch, where: b.id == ^batch_id),
        set: [closed_at: now, auto_closed: true]
      )
    end
  end

  defp increment_sold(%{type: "extra", item_id: id, quantity: qty}) do
    Repo.update_all(from(ei in ExtraItem, where: ei.id == ^id), inc: [quantity_sold: qty])
  end

  # Boleto goes through the transparent endpoint (no product items, just the
  # total + buyer identity); PIX/CARD use the hosted checkout restricted to the
  # single method the buyer chose up front.
  defp build_checkout(_order, _line_items, user, total_cents, "BOLETO") do
    abacate_pay().create_boleto(total_cents, user.name, user.tax_id)
  end

  defp build_checkout(order, line_items, user, total_cents, payment_method) do
    with {:ok, abacate_items} <- collect_abacate_items(line_items) do
      frontend_url = Application.get_env(:backend, :frontend_url, "http://localhost:5173")
      return_url = "#{frontend_url}/orders"
      completion_url = "#{frontend_url}/orders/#{order.id}"

      abacate_pay().create_checkout(
        abacate_items,
        return_url,
        completion_url,
        user.abacate_customer_id,
        total_cents,
        [payment_method]
      )
    end
  end

  # Lines with `price_cents == 0` (free batches, free extras) are excluded
  # from the upstream invoice — Abacate Pay rejects zero-priced items and
  # there's nothing to bill anyway. The order still records them; passes are
  # issued normally.
  defp collect_abacate_items(line_items) do
    paid_lines = Enum.filter(line_items, &(&1.price_cents > 0))

    Enum.reduce_while(paid_lines, {:ok, []}, fn line, {:ok, acc} ->
      case line.abacate_product_id do
        id when is_binary(id) -> {:cont, {:ok, acc ++ [%{id: id, quantity: line.quantity}]}}
        _ -> {:halt, {:error, {:missing_abacate_product, line.name}}}
      end
    end)
  end

  # The chosen `payment_method` is known up front now (we restrict the checkout
  # to it), so we store it at creation rather than waiting for the webhook. This
  # also gives the ExpiryWorker a clean discriminator for boleto reconciliation.
  defp attach_checkout(
         order,
         event,
         %{id: checkout_id, url: payment_url} = checkout,
         payment_method
       ) do
    changes = [
      abacate_checkout_id: checkout_id,
      abacate_payment_url: payment_url,
      payment_method: payment_method,
      expires_at: parse_expires_at(checkout[:expires_at])
    ]

    {:ok, updated} =
      order
      |> Ecto.Changeset.change(changes)
      |> Repo.update()

    updated |> Repo.preload(:items) |> Map.put(:event_title, event.title)
  end

  defp parse_expires_at(nil), do: nil

  defp parse_expires_at(iso8601) when is_binary(iso8601) do
    case DateTime.from_iso8601(iso8601) do
      {:ok, dt, _offset} -> DateTime.truncate(dt, :second)
      {:error, _} -> nil
    end
  end

  defp cancel_order(order) do
    order = Repo.preload(order, :items)

    Repo.transaction(fn ->
      {:ok, updated} =
        order
        |> Ecto.Changeset.change(status: "expired")
        |> Repo.update()

      release_order_stock(order)
      updated
    end)
  end

  defp find_order_by_checkout(checkout_id) do
    Repo.one(from(o in Order, where: o.abacate_checkout_id == ^checkout_id, preload: :items))
  end

  defp release_order_stock(order) do
    Enum.each(order.items, fn item ->
      case {item.item_type, item.batch_id} do
        {"ticket", batch_id} when is_binary(batch_id) ->
          release_batch_stock(batch_id, item.quantity)

        {"extra", _} ->
          Repo.update_all(
            from(ei in ExtraItem, where: ei.id == ^item.item_id),
            inc: [quantity_sold: -item.quantity]
          )

        {"ticket", nil} ->
          # Defensive: any pre-batches order row would have been backfilled by
          # the migration, but fall back to ticket_type if we ever see one.
          :ok
      end
    end)

    Seating.release_for_order(order.id)
  end

  # Decrement the batch's sold count; if it was auto-closed (sellout), reopen
  # it since stock just became available again. A manually-closed batch stays
  # closed — the creator's close is sticky against refunds.
  defp release_batch_stock(batch_id, qty) do
    {1, [batch]} =
      Repo.update_all(
        from(b in TicketBatch, where: b.id == ^batch_id, select: b),
        inc: [quantity_sold: -qty]
      )

    if batch.auto_closed and batch.quantity_sold < batch.quantity_total do
      Repo.update_all(
        from(b in TicketBatch, where: b.id == ^batch_id),
        set: [closed_at: nil, auto_closed: false]
      )
    end
  end

  defp abacate_pay do
    Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)
  end
end
