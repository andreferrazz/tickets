defmodule BackendWeb.OrderController do
  use BackendWeb, :controller

  alias Backend.Orders

  @doc "POST /api/v1/orders"
  def create(conn, %{"event_id" => event_id, "items" => items}) do
    case Orders.create_order(conn.assigns.current_user, event_id, items) do
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

      {:error, :ticket_required} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "at least one ticket is required to buy extra items"})

      {:error, {:out_of_stock, name}} ->
        conn |> put_status(:conflict) |> json(%{error: "out of stock: #{name}"})

      {:error, {:invalid_item, id}} ->
        conn |> put_status(:bad_request) |> json(%{error: "invalid item: #{id}"})

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

  @doc "GET /api/v1/orders/:id"
  def show(conn, %{"id" => id}) do
    case Orders.get_order(conn.assigns.current_user, id) do
      {:ok, order} -> json(conn, order_json(order))
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
