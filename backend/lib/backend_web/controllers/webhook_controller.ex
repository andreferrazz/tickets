defmodule BackendWeb.WebhookController do
  @moduledoc """
  Receives payment events from Abacate Pay.

  Two-layer auth, per Abacate Pay docs:

    1. A per-tenant secret in the query string (`?webhookSecret=...`),
       compared against `:abacate_pay_webhook_secret` config.
    2. An HMAC-SHA256 signature of the raw body using Abacate Pay's
       fixed public key, sent in the `x-webhook-signature` header as
       a base64 digest.
  """

  use BackendWeb, :controller

  alias Backend.AbacatePay
  alias Backend.Orders
  alias Backend.Tickets
  alias Backend.Webhooks

  @doc "POST /webhooks/abacate-pay"
  def abacate_pay(conn, params) do
    with :ok <- verify_url_secret(conn),
         :ok <- verify_signature(conn),
         {:ok, _event} <- Webhooks.log_event(params) do
      result = dispatch_event(params)
      handle_result(conn, result)
    else
      {:error, :unauthorized} ->
        conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})

      {:error, :invalid_signature} ->
        conn |> put_status(:unauthorized) |> json(%{error: "invalid signature"})

      {:error, %Ecto.Changeset{} = cs} ->
        conn |> put_status(:internal_server_error) |> json(%{error: inspect(cs.errors)})
    end
  end

  defp dispatch_event(%{"event" => "checkout.completed", "data" => %{"id" => id}}) do
    with {:ok, order} <- Orders.mark_paid_by_checkout(id),
         order = order |> Backend.Repo.preload([:user, :items]) |> Orders.with_event_title(),
         {:ok, passes, status} <- Tickets.issue_for_order(order) do
      if status == :created, do: deliver_pass_emails(order, passes)
      {:ok, order}
    end
  end

  defp dispatch_event(%{"event" => "checkout.refunded", "data" => %{"id" => id}}) do
    Orders.mark_refunded_by_checkout(id)
  end

  defp dispatch_event(_), do: :ok

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

  defp handle_result(conn, {:ok, _}), do: json(conn, %{ok: true})
  defp handle_result(conn, :ok), do: json(conn, %{ok: true})

  defp handle_result(conn, {:error, :not_found}) do
    conn |> put_status(:not_found) |> json(%{error: "order not found"})
  end

  defp handle_result(conn, {:error, reason}) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
  end

  defp verify_url_secret(conn) do
    expected = Application.get_env(:backend, :abacate_pay_webhook_secret, "")
    received = Map.get(fetch_query_params(conn).query_params, "webhookSecret", "")

    if expected != "" and Plug.Crypto.secure_compare(expected, received) do
      :ok
    else
      {:error, :unauthorized}
    end
  end

  defp verify_signature(conn) do
    raw_body = Map.get(conn.private, :raw_body, "")
    [received | _] = get_req_header(conn, "x-webhook-signature") ++ [""]

    expected =
      :crypto.mac(:hmac, :sha256, AbacatePay.public_key(), raw_body)
      |> Base.encode64()

    if Plug.Crypto.secure_compare(expected, received) do
      :ok
    else
      {:error, :invalid_signature}
    end
  end
end
