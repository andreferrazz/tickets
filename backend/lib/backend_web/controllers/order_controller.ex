defmodule BackendWeb.OrderController do
  use BackendWeb, :controller

  alias Backend.Orders
  alias Backend.Tickets

  @doc "POST /api/v1/orders"
  def create(conn, %{"event_id" => event_id, "items" => items} = params) do
    seat_picks = Map.get(params, "seat_picks", [])

    case Orders.create_order(conn.assigns.current_user, event_id, items, seat_picks) do
      {:ok, order} ->
        conn |> put_status(:created) |> json(order_json(order))

      {:error, :event_not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :event_not_available} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "event is not available for purchase"})

      {:error, :no_items} ->
        conn |> put_status(:bad_request) |> json(%{error: "no items provided"})

      {:error, {:out_of_stock, name}} ->
        conn |> put_status(:conflict) |> json(%{error: "out of stock: #{name}"})

      {:error, {:extra_exceeds_tickets, name, _qty, _tickets}} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "extra_exceeds_tickets", name: name})

      {:error, {:invalid_item, id}} ->
        conn |> put_status(:bad_request) |> json(%{error: "invalid item: #{id}"})

      {:error, {:seat_taken, _}} ->
        conn |> put_status(:conflict) |> json(%{error: "seat_taken"})

      {:error, {:seat_count_mismatch, got, expected}} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "seat_count_mismatch", got: got, expected: expected})

      {:error, {:invalid_seat_pick, detail}} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "invalid_seat_pick", detail: detail})

      {:error, reason} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
    end
  end

  def create(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "event_id and items required"})

  @doc "GET /api/v1/orders"
  def index(conn, _params) do
    orders = Orders.list_orders(conn.assigns.current_user)
    json(conn, Enum.map(orders, &order_json/1))
  end

  @doc """
  GET /api/v1/events/:event_id/orders

  Lists orders for an event for its organization members (or admin).

  Accepts repeated `status[]=paid&status[]=pending` query params or a
  comma-separated `status=paid,pending`. Omit to return every status.
  """
  def event_index(conn, %{"event_id" => event_id} = params) do
    statuses = parse_statuses(params["status"])

    case Orders.list_event_orders(conn.assigns.current_user, event_id, statuses) do
      {:ok, orders} ->
        json(conn, Enum.map(orders, &event_order_json/1))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, {:invalid_status, value}} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "invalid status", value: to_string(value)})
    end
  end

  defp parse_statuses(nil), do: nil
  defp parse_statuses([]), do: nil
  defp parse_statuses(list) when is_list(list), do: list

  defp parse_statuses(value) when is_binary(value) do
    value |> String.split(",", trim: true) |> Enum.map(&String.trim/1)
  end

  defp parse_statuses(_), do: nil

  @doc "GET /api/v1/orders/:id"
  def show(conn, %{"id" => id}) do
    case Orders.get_order(conn.assigns.current_user, id) do
      {:ok, order} -> json(conn, order_json(order))
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "order not found"})
    end
  end

  @doc """
  GET /api/v1/orders/:id/passes

  Returns the QR passes for the buyer's order. The QR PNG is embedded as a
  base64 data string so the page can render `<img src="data:image/png;...">`
  without a second authenticated request per image.
  """
  def passes(conn, %{"id" => id}) do
    with {:ok, order} <- Orders.get_order(conn.assigns.current_user, id) do
      passes = Tickets.list_for_order(order)
      json(conn, Enum.map(passes, &pass_json/1))
    else
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "order not found"})
    end
  end

  # ---------------------------------------------------------------------------

  def order_json(order) do
    %{
      id: order.id,
      user_id: order.user_id,
      event_id: order.event_id,
      event_title: order.event_title,
      status: order.status,
      total_cents: order.total_cents,
      abacate_payment_url: order.abacate_payment_url,
      paid_at: order.paid_at,
      created_at: order.inserted_at,
      items: Enum.map(order.items, &order_item_json/1)
    }
  end

  defp pass_json(pass) do
    %{
      id: pass.id,
      kind: pass.kind,
      item_name: pass.item_name,
      seat_label: pass.seat_label,
      token: pass.token,
      checked_in_at: pass.checked_in_at,
      qr_png_base64: pass |> Tickets.qr_png() |> Base.encode64()
    }
  end

  defp event_order_json(order) do
    {tickets, extras} = Enum.split_with(order.items, &(&1.item_type == "ticket"))

    %{
      id: order.id,
      buyer_name: order.user && order.user.name,
      buyer_email: order.user && order.user.email,
      buyer_phone: order.user && order.user.cellphone,
      status: order.status,
      total_cents: order.total_cents,
      payment_method: order.payment_method,
      paid_at: order.paid_at,
      created_at: order.inserted_at,
      tickets: Enum.map(tickets, &line_json/1),
      extras: Enum.map(extras, &line_json/1)
    }
  end

  defp line_json(item) do
    %{
      name: item.item_name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents
    }
  end

  defp order_item_json(item) do
    %{
      id: item.id,
      order_id: item.order_id,
      item_type: item.item_type,
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents
    }
  end
end
