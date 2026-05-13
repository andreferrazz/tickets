defmodule Backend.Orders do
  @moduledoc """
  Order management: creation with stock reservation, listing, and webhook callbacks.

  The Abacate Pay client module is configurable via `:abacate_pay_module` so
  tests can inject a stub without HTTP calls.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Events.{Event, ExtraItem, TicketType}
  alias Backend.Orders.{Order, OrderItem}

  # ---------------------------------------------------------------------------
  # Create
  # ---------------------------------------------------------------------------

  @doc """
  Creates an order for `user` on `event_id` with the given `cart_items`.

  Steps:
    1. Resolve and validate each item (stock check, price snapshot).
    2. Open a DB transaction: reserve stock, insert order + items.
    3. Ensure each item has an Abacate Pay product.
    4. Create Abacate Pay checkout, store the bill_id and payment URL.

  Returns `{:ok, order}` or `{:error, reason}`.
  """
  def create_order(user, event_id, cart_items) do
    with {:ok, event} <- fetch_published_event(event_id),
         {:ok, line_items} <- resolve_items(event, cart_items),
         total = compute_total(line_items),
         {:ok, order} <- reserve_order(user, event, total, line_items) do
      case build_checkout(order, line_items) do
        {:ok, checkout} ->
          {:ok, attach_checkout(order, event, checkout)}

        {:error, reason} ->
          cancel_order(order)
          {:error, reason}
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Query
  # ---------------------------------------------------------------------------

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
  # Webhook callbacks
  # ---------------------------------------------------------------------------

  @doc "Marks order as paid when Abacate Pay sends checkout.completed."
  def mark_paid_by_checkout(checkout_id) do
    case find_order_by_checkout(checkout_id) do
      nil ->
        {:error, :not_found}

      order ->
        order
        |> Ecto.Changeset.change(
          status: "paid",
          paid_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
        |> Repo.update()
        |> then(fn {:ok, o} -> {:ok, o} end)
    end
  end

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

  @doc "Marks stale pending orders as expired and releases their stock."
  def expire_stale_orders(expiry_minutes) do
    cutoff = DateTime.add(DateTime.utc_now(), -expiry_minutes * 60, :second)

    expired =
      Repo.all(
        from(o in Order,
          where: o.status == "pending" and o.inserted_at < ^cutoff,
          preload: :items
        )
      )

    Enum.each(expired, fn order ->
      Repo.transaction(fn ->
        order
        |> Ecto.Changeset.change(status: "expired")
        |> Repo.update!()

        release_order_stock(order)
      end)
    end)

    length(expired)
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp fetch_published_event(event_id) do
    case Repo.one(from e in Event, where: e.id == ^event_id and is_nil(e.deleted_at)) do
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
    tt = Repo.one(from t in TicketType, where: t.id == ^id and is_nil(t.deleted_at))

    cond do
      is_nil(tt) or tt.event_id != event.id -> {:error, {:invalid_item, id}}
      tt.quantity_total - tt.quantity_sold < qty -> {:error, {:out_of_stock, tt.name}}
      true -> {:ok, %{type: "ticket", record: tt, quantity: qty}}
    end
  end

  defp resolve_line(event, %{"item_type" => "extra", "item_id" => id, "quantity" => qty})
       when is_integer(qty) and qty > 0 do
    ex = Repo.one(from x in ExtraItem, where: x.id == ^id and is_nil(x.deleted_at))

    cond do
      is_nil(ex) or ex.event_id != event.id ->
        {:error, {:invalid_item, id}}

      not is_nil(ex.quantity_total) and ex.quantity_total - ex.quantity_sold < qty ->
        {:error, {:out_of_stock, ex.name}}

      true ->
        {:ok, %{type: "extra", record: ex, quantity: qty}}
    end
  end

  defp resolve_line(_event, line), do: {:error, {:invalid_line, inspect(line)}}

  defp compute_total(line_items) do
    Enum.reduce(line_items, 0, fn %{record: r, quantity: q}, acc ->
      acc + r.price_cents * q
    end)
  end

  defp reserve_order(user, event, total, line_items) do
    Repo.transaction(fn ->
      order =
        %{user_id: user.id, event_id: event.id, total_cents: total}
        |> Order.changeset()
        |> Repo.insert!()

      Enum.each(line_items, fn %{type: type, record: r, quantity: qty} ->
        %{
          "order_id" => order.id,
          "item_type" => type,
          "item_id" => r.id,
          "item_name" => r.name,
          "quantity" => qty,
          "unit_price_cents" => r.price_cents
        }
        |> OrderItem.changeset()
        |> Repo.insert!()

        increment_sold(type, r.id, qty)
      end)

      order
    end)
  end

  defp increment_sold("ticket", id, qty) do
    Repo.update_all(from(tt in TicketType, where: tt.id == ^id), inc: [quantity_sold: qty])
  end

  defp increment_sold("extra", id, qty) do
    Repo.update_all(from(ei in ExtraItem, where: ei.id == ^id), inc: [quantity_sold: qty])
  end

  defp build_checkout(order, line_items) do
    with {:ok, abacate_items} <- ensure_products(line_items) do
      frontend_url = Application.get_env(:backend, :frontend_url, "http://localhost:5173")
      return_url = "#{frontend_url}/orders"
      completion_url = "#{frontend_url}/orders/#{order.id}"
      abacate_pay().create_checkout(abacate_items, return_url, completion_url)
    end
  end

  defp ensure_products(line_items) do
    Enum.reduce_while(line_items, {:ok, []}, fn %{type: type, record: r, quantity: qty},
                                                {:ok, acc} ->
      case ensure_product(type, r) do
        {:ok, prod_id} -> {:cont, {:ok, acc ++ [%{id: prod_id, quantity: qty}]}}
        {:error, _} = err -> {:halt, err}
      end
    end)
  end

  defp ensure_product(_type, %{abacate_product_id: id}) when is_binary(id), do: {:ok, id}

  defp ensure_product(type, record) do
    external_id = "#{type}_#{record.id}"

    case abacate_pay().create_product(record.name, record.price_cents, external_id) do
      {:ok, prod_id} ->
        record
        |> Ecto.Changeset.change(abacate_product_id: prod_id)
        |> Repo.update!()

        {:ok, prod_id}

      error ->
        error
    end
  end

  defp attach_checkout(order, event, %{id: checkout_id, url: payment_url}) do
    {:ok, updated} =
      order
      |> Ecto.Changeset.change(abacate_checkout_id: checkout_id, abacate_payment_url: payment_url)
      |> Repo.update()

    updated |> Repo.preload(:items) |> Map.put(:event_title, event.title)
  end

  defp cancel_order(order) do
    order
    |> Ecto.Changeset.change(status: "expired")
    |> Repo.update()
  end

  defp find_order_by_checkout(checkout_id) do
    Repo.one(from(o in Order, where: o.abacate_checkout_id == ^checkout_id, preload: :items))
  end

  defp release_order_stock(order) do
    Enum.each(order.items, fn item ->
      case item.item_type do
        "ticket" ->
          Repo.update_all(
            from(tt in TicketType, where: tt.id == ^item.item_id),
            inc: [quantity_sold: -item.quantity]
          )

        "extra" ->
          Repo.update_all(
            from(ei in ExtraItem, where: ei.id == ^item.item_id),
            inc: [quantity_sold: -item.quantity]
          )
      end
    end)
  end

  defp abacate_pay do
    Application.get_env(:backend, :abacate_pay_module, Backend.AbacatePay)
  end
end
