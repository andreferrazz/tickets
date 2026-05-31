defmodule BackendWeb.PayoutController do
  use BackendWeb, :controller

  alias Backend.Payouts

  @doc "POST /api/v1/events/:event_id/payouts — leader-only withdrawal request (admins bypass)."
  def create(conn, %{"event_id" => event_id} = params) do
    attrs = Map.take(params, ["amount_cents"])

    case Payouts.create_payout(conn.assigns.current_user, event_id, attrs) do
      {:ok, payout} ->
        conn |> put_status(:created) |> json(payout_json(payout))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, :pix_key_missing} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "pix_key_missing"})

      {:error, :invalid_amount} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid_amount"})

      {:error, :insufficient_balance} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "insufficient_balance"})

      {:error, :rate_limited} ->
        conn |> put_status(:too_many_requests) |> json(%{error: "rate_limited"})

      {:error, {:rate_limited, _body}} ->
        conn |> put_status(:too_many_requests) |> json(%{error: "rate_limited"})

      {:error, {:invalid_data, _status, msg}} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(msg)})

      {:error, reason} ->
        conn |> put_status(:bad_gateway) |> json(%{error: inspect(reason)})
    end
  end

  @doc "GET /api/v1/events/:event_id/payouts — recent payout history for the event."
  def index(conn, %{"event_id" => event_id}) do
    case Backend.Events.event_stats(conn.assigns.current_user, event_id) do
      {:ok, _stats} ->
        json(conn, Enum.map(Payouts.list_payouts(event_id), &payout_json/1))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})
    end
  end

  defp payout_json(p) do
    %{
      id: p.id,
      amount_cents: p.amount_cents,
      status: p.status,
      pix_key: p.pix_key,
      pix_key_type: p.pix_key_type,
      receipt_url: p.receipt_url,
      error_message: p.error_message,
      created_at: p.inserted_at
    }
  end
end
