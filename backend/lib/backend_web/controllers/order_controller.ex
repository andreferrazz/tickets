defmodule BackendWeb.OrderController do
  use BackendWeb, :controller

  alias Backend.Orders
  alias Backend.Tickets

  @valid_payment_methods ~w(PIX CARD BOLETO)

  @doc "POST /api/v1/orders"
  def create(conn, %{"event_id" => event_id, "items" => items} = params) do
    seat_picks = Map.get(params, "seat_picks", [])
    payment_method = Map.get(params, "payment_method")

    with :ok <- validate_payment_method(payment_method) do
      create_with_method(conn, event_id, items, seat_picks, payment_method)
    else
      {:error, :invalid_payment_method} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "invalid payment_method: #{inspect(payment_method)}"})
    end
  end

  def create(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "event_id and items required"})

  # Paid orders require one of the supported methods; free orders (total 0)
  # skip Abacate entirely, so a nil method is allowed and ignored downstream.
  defp validate_payment_method(nil), do: :ok
  defp validate_payment_method(m) when m in @valid_payment_methods, do: :ok
  defp validate_payment_method(_), do: {:error, :invalid_payment_method}

  defp create_with_method(conn, event_id, items, seat_picks, payment_method) do
    case Orders.create_order(
           conn.assigns.current_user,
           event_id,
           items,
           seat_picks,
           payment_method
         ) do
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

  @doc """
  POST /api/v1/events/:event_id/comp-orders

  Issues free tickets of a single ticket type (`item_id`) to a list of
  `recipients`, each `%{"email" => ..., "quantity" => n}` with its own amount.
  Recipients are processed independently; the response reports the addresses
  that were `sent` and those that `failed` (with a short reason), so a malformed
  email, a bad quantity, or a sold-out batch skips only that recipient rather
  than aborting the whole guest list. See `Orders.create_comp_order/4`.
  """
  def create_comp_orders(
        conn,
        %{"event_id" => event_id, "item_id" => item_id, "recipients" => recipients}
      )
      when is_binary(item_id) and is_list(recipients) do
    results =
      Enum.map(recipients, fn recipient ->
        comp_recipient(conn.assigns.current_user, event_id, item_id, recipient)
      end)

    json(conn, comp_summary_json(results))
  end

  def create_comp_orders(conn, _),
    do:
      conn
      |> put_status(:bad_request)
      |> json(%{error: "item_id (string) and recipients (list) are required"})

  # Issues the recipient's requested quantity of `item_id`. Validates the
  # quantity here so a bad amount surfaces as a clean per-recipient failure
  # rather than a generic resolve error.
  defp comp_recipient(user, event_id, item_id, %{"email" => email, "quantity" => qty})
       when is_integer(qty) and qty > 0 do
    items = [%{"item_type" => "ticket", "item_id" => item_id, "quantity" => qty}]
    {email, Orders.create_comp_order(user, event_id, email, items)}
  end

  defp comp_recipient(_user, _event_id, _item_id, %{"email" => email}),
    do: {email, {:error, :invalid_quantity}}

  defp comp_recipient(_user, _event_id, _item_id, _recipient),
    do: {nil, {:error, :invalid_recipient}}

  # Splits per-recipient results into successfully-sent addresses and failures
  # carrying a short, client-facing reason string.
  defp comp_summary_json(results) do
    {sent, failed} = Enum.split_with(results, fn {_email, res} -> match?({:ok, _}, res) end)

    %{
      sent: Enum.map(sent, fn {email, _} -> email end),
      failed:
        Enum.map(failed, fn {email, {:error, reason}} ->
          %{email: email, error: comp_error(reason)}
        end)
    }
  end

  defp comp_error(:invalid_email), do: "invalid_email"
  defp comp_error(:invalid_quantity), do: "invalid_quantity"
  defp comp_error(:invalid_recipient), do: "invalid_recipient"
  defp comp_error(:extras_not_comped), do: "extras_not_comped"
  defp comp_error(:not_found), do: "not_found"
  defp comp_error(:event_not_available), do: "event_not_available"
  defp comp_error(:no_items), do: "no_items"
  defp comp_error({:out_of_stock, name}), do: "out_of_stock: #{name}"
  defp comp_error({:invalid_item, id}), do: "invalid_item: #{id}"
  defp comp_error(other), do: inspect(other)

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
  POST /api/v1/orders/:id/cancel

  Cancels the buyer's own order. Only unpaid orders are cancellable: free
  orders (nothing charged) and pending orders that Abacate Pay confirms are
  not yet paid. See `Orders.cancel_order/2`.
  """
  def cancel(conn, %{"id" => id}) do
    cancel_response(conn, Orders.cancel_order(conn.assigns.current_user, id), &order_json/1)
  end

  @doc """
  POST /api/v1/events/:event_id/orders/:order_id/cancel

  Cancels an order on behalf of an event manager (admin, leader, or
  participant of the event's organization). See `Orders.cancel_event_order/2`.
  """
  def cancel_event_order(conn, %{"order_id" => order_id}) do
    cancel_response(
      conn,
      Orders.cancel_event_order(conn.assigns.current_user, order_id),
      &event_order_json/1
    )
  end

  # Shared response mapping for both the buyer and manager cancel endpoints;
  # only the success serialization (`render`) differs.
  defp cancel_response(conn, {:ok, order}, render), do: json(conn, render.(order))

  defp cancel_response(conn, {:error, :not_found}, _render),
    do: conn |> put_status(:not_found) |> json(%{error: "order not found"})

  defp cancel_response(conn, {:error, :not_cancellable}, _render),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "order cannot be cancelled"})

  defp cancel_response(conn, {:error, :already_paid}, _render),
    do: conn |> put_status(:conflict) |> json(%{error: "order already paid"})

  defp cancel_response(conn, {:error, :payment_check_failed}, _render),
    do: conn |> put_status(:bad_gateway) |> json(%{error: "payment status check failed"})

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
      extras: Enum.map(extras, &line_json/1),
      validated_count: validated_ticket_count(order.passes)
    }
  end

  # Checked-in ticket passes ("validated"); one pass row exists per ticket unit.
  defp validated_ticket_count(passes) do
    Enum.count(passes, &(&1.kind == "ticket" and &1.checked_in_at))
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
