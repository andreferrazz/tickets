defmodule BackendWeb.WebhookController do
  @moduledoc """
  Receives payment events from Abacate Pay.

  HMAC-SHA256 validation uses the shared `abacate_pay_webhook_secret`.
  Signature is expected in the `x-abacatepay-hmac-sha256` header as a hex
  digest (no prefix).
  """

  use BackendWeb, :controller

  require Logger

  alias Backend.Orders

  @doc "POST /webhooks/abacate-pay"
  def abacate_pay(conn, params) do
    with :ok <- verify_signature(conn) do
      result = dispatch_event(params)
      handle_result(conn, result)
    else
      {:error, :invalid_signature} ->
        conn |> put_status(:unauthorized) |> json(%{error: "invalid signature"})
    end
  end

  defp dispatch_event(%{"event" => "checkout.completed", "data" => %{"id" => id}}) do
    with {:ok, order} <- Orders.mark_paid_by_checkout(id) do
      order = Backend.Repo.preload(order, :user)
      Backend.Mailer.send_order_confirmation(order.user.email, order)
      {:ok, order}
    end
  end

  defp dispatch_event(%{"event" => "checkout.refunded", "data" => %{"id" => id}}) do
    Orders.mark_refunded_by_checkout(id)
  end

  defp dispatch_event(_), do: :ok

  defp handle_result(conn, {:ok, _}), do: json(conn, %{ok: true})
  defp handle_result(conn, :ok), do: json(conn, %{ok: true})

  defp handle_result(conn, {:error, :not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "order not found"})
  end

  defp handle_result(conn, {:error, reason}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
  end

  defp verify_signature(conn) do
    secret = Application.get_env(:backend, :abacate_pay_webhook_secret, "")
    raw_body = Map.get(conn.private, :raw_body, "")
    [received | _] = get_req_header(conn, "x-abacatepay-hmac-sha256") ++ [""]

    Logger.info("Received: #{received}, Secret: #{secret}")

    expected =
      :crypto.mac(:hmac, :sha256, secret, raw_body)
      |> Base.encode16(case: :lower)

    if Plug.Crypto.secure_compare(expected, received) do
      :ok
    else
      {:error, :invalid_signature}
    end
  end
end
