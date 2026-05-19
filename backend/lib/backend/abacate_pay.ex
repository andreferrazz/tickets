defmodule Backend.AbacatePay do
  @moduledoc """
  HTTP client for the Abacate Pay API v2.

  Base URL: https://api.abacatepay.com/v2
  Auth: Authorization: Bearer <api_key>
  """

  @behaviour Backend.AbacatePayBehaviour

  @base_url "https://api.abacatepay.com/v2"

  @public_key "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"

  @doc "Abacate Pay's fixed public HMAC key used to sign webhook bodies."
  def public_key, do: @public_key

  defp api_key, do: Application.fetch_env!(:backend, :abacate_pay_api_key)

  defp auth_header, do: {"authorization", "Bearer #{api_key()}"}

  @doc """
  Creates a product in Abacate Pay.

  Returns `{:ok, prod_id}` where prod_id is the Abacate Pay `prod_*` identifier.
  """
  @impl Backend.AbacatePayBehaviour
  def create_product(name, price_cents, external_id) do
    body = %{name: name, price: price_cents, currency: "BRL", externalId: external_id}

    case Req.post("#{@base_url}/products/create", json: body, headers: [auth_header()]) do
      {:ok, %{status: 200, body: %{"data" => %{"id" => id}}}} ->
        {:ok, id}

      {:ok, %{status: status, body: body}} ->
        {:error, "abacate_pay product #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Creates a customer in Abacate Pay. Customers are unique per CPF/CNPJ;
  Abacate returns the existing one when the `taxId` already exists.

  Returns `{:ok, cust_id}`.
  """
  @impl Backend.AbacatePayBehaviour
  def create_customer(email, name, cellphone, tax_id) do
    body = %{email: email, name: name, cellphone: cellphone, taxId: tax_id}

    case Req.post("#{@base_url}/customers/create", json: body, headers: [auth_header()]) do
      {:ok, %{status: status, body: %{"data" => %{"id" => id}}}} when status in 200..201 ->
        {:ok, id}

      {:ok, %{status: status, body: %{"error" => msg}}} when status in 400..499 ->
        {:error, {:invalid_data, status, msg}}

      {:ok, %{status: status, body: body}} ->
        {:error, {:upstream, status, body}}

      {:error, reason} ->
        {:error, {:transport, reason}}
    end
  end

  @doc """
  Creates a checkout session with the given product items.

  Returns `{:ok, %{id: bill_id, url: payment_url}}`.
  """
  @impl Backend.AbacatePayBehaviour
  def create_checkout(items, return_url, completion_url, customer_id, total_cents) do
    body =
      %{
        items: items,
        methods: ["PIX", "CARD"],
        card: %{maxInstallments: max_card_installments(total_cents)},
        returnUrl: return_url,
        completionUrl: completion_url
      }
      |> maybe_put(:customerId, customer_id)

    case Req.post("#{@base_url}/checkouts/create", json: body, headers: [auth_header()]) do
      {:ok, %{status: 200, body: %{"data" => %{"id" => id, "url" => url}}}} ->
        {:ok, %{id: id, url: url}}

      {:ok, %{status: status, body: body}} ->
        {:error, "abacate_pay checkout #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  @doc """
  Returns the card installment cap for a given order total.

  Each installment must be worth at least R$10 (1_000 cents), capped at the
  configured maximum (default 3). Always returns at least 1 so single-payment
  stays available on tiny orders.
  """
  def max_card_installments(total_cents) do
    cap = Application.get_env(:backend, :max_card_installments, 3)
    by_value = div(total_cents, 1_000)
    max(1, min(cap, by_value))
  end

  # Abacate Pay fee table (per the seller profile). Hardcoded here because
  # Abacate does not surface fees via API. Update if the seller renegotiates.
  @pix_fee_cents 80
  @card_fixed_cents 60
  @card_rate_1x_bps 350
  @card_rate_2_to_6_bps 400
  @card_rate_7_to_12_bps 450

  @doc """
  Returns the Abacate Pay fee, in cents, that will be deducted from the
  organizer's payout for an order of `total_cents` paid via `payment_method`.

  Methods:
    * `"PIX"` — flat R$0,80 regardless of order total.
    * `"CARD"` — percentage of total (varies with installments) + R$0,60.
      Unknown or out-of-range installments fall back to the 1x rate.
    * anything else (including `nil`) — treated as PIX, since legacy paid
      orders predate payment-method tracking and PIX is the typical default.

  Pure: no I/O, safe to call from queries.
  """
  def fee_cents(total_cents, payment_method, installments \\ nil)

  def fee_cents(_total_cents, "PIX", _installments), do: @pix_fee_cents

  def fee_cents(total_cents, "CARD", installments) when is_integer(total_cents) do
    rate_bps = card_rate_bps(installments)
    div(total_cents * rate_bps, 10_000) + @card_fixed_cents
  end

  def fee_cents(_total_cents, _method, _installments), do: @pix_fee_cents

  defp card_rate_bps(n) when is_integer(n) and n >= 7 and n <= 12, do: @card_rate_7_to_12_bps
  defp card_rate_bps(n) when is_integer(n) and n >= 2 and n <= 6, do: @card_rate_2_to_6_bps
  defp card_rate_bps(_), do: @card_rate_1x_bps
end
