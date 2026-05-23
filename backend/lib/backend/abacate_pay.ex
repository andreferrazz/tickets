defmodule Backend.AbacatePay do
  @moduledoc """
  HTTP client for the Abacate Pay API v2.

  Base URL: https://api.abacatepay.com/v2
  Auth: Authorization: Bearer <api_key>
  """

  @behaviour Backend.AbacatePayBehaviour

  @base_url "https://api.abacatepay.com/v2"
  @v1_base_url "https://api.abacatepay.com/v1"

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
  Retrieves a checkout by id from Abacate Pay.

  Endpoint: `GET /v2/checkouts/get?id=<id>`.

  Returns `{:ok, %{status: String.t(), payment_method: String.t() | nil,
  card_installments: pos_integer() | nil}}`.

  `status` is normalised to one of `"paid"`, `"pending"`, `"cancelled"`,
  `"expired"`, `"refunded"`. Anything else is mapped to `"pending"` so the
  reconciler treats unknown states as "not yet terminal" and retries next
  cycle.
  """
  @impl Backend.AbacatePayBehaviour
  def get_checkout(checkout_id) when is_binary(checkout_id) do
    url = "#{@base_url}/checkouts/get"

    case Req.get(url, params: [id: checkout_id], headers: [auth_header()]) do
      {:ok, %{status: 200, body: %{"data" => data}}} when is_map(data) ->
        {:ok,
         %{
           status: normalize_checkout_status(data["status"]),
           payment_method: extract_payment_method(data),
           card_installments: extract_card_installments(data)
         }}

      {:ok, %{status: status, body: body}} ->
        {:error, "abacate_pay get_checkout #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Requests a PIX payout (withdrawal). Endpoint lives under v1 (not v2).

  `external_id` is our own UUID — Abacate echoes it back and uses it as the
  idempotency key against accidental retries.
  """
  @impl Backend.AbacatePayBehaviour
  def create_payout(amount_cents, external_id, description, pix_key, pix_key_type)
      when is_integer(amount_cents) and amount_cents > 0 do
    body =
      %{
        amount: amount_cents,
        externalId: external_id,
        pixKey: pix_key,
        pixKeyType: pix_key_type
      }
      |> maybe_put(:description, description)

    case Req.post("#{@v1_base_url}/payouts/create",
           json: body,
           headers: [auth_header()]
         ) do
      {:ok, %{status: status, body: %{"data" => data}}} when status in 200..201 ->
        {:ok,
         %{
           id: data["id"],
           status: normalize_payout_status(data["status"]),
           receipt_url: data["receiptUrl"]
         }}

      {:ok, %{status: 429, body: body}} ->
        {:error, {:rate_limited, body}}

      {:ok, %{status: status, body: %{"error" => msg}}} when status in 400..499 ->
        {:error, {:invalid_data, status, msg}}

      {:ok, %{status: status, body: body}} ->
        {:error, {:upstream, status, body}}

      {:error, reason} ->
        {:error, {:transport, reason}}
    end
  end

  @doc "Normalises Abacate payout status to lowercase."
  def normalize_payout_status(status) when is_binary(status) do
    case String.upcase(status) do
      "PENDING" -> "pending"
      "COMPLETE" -> "complete"
      "FAILED" -> "failed"
      "CANCELLED" -> "cancelled"
      "REFUNDED" -> "refunded"
      "EXPIRED" -> "expired"
      _ -> "pending"
    end
  end

  def normalize_payout_status(_), do: "pending"

  defp normalize_checkout_status(status) when is_binary(status) do
    case String.upcase(status) do
      "PAID" -> "paid"
      "PENDING" -> "pending"
      "CANCELLED" -> "cancelled"
      "EXPIRED" -> "expired"
      "REFUNDED" -> "refunded"
      _ -> "pending"
    end
  end

  defp normalize_checkout_status(_), do: "pending"

  # Abacate Pay's checkout payload doesn't surface the chosen method explicitly
  # in the v2 spec — only `installmentsCount` is populated for card payments.
  # Infer CARD when installments are present; leave nil otherwise so callers
  # don't overwrite a webhook-populated value with a guess.
  defp extract_payment_method(%{"installmentsCount" => n}) when is_integer(n) and n > 0,
    do: "CARD"

  defp extract_payment_method(_), do: nil

  defp extract_card_installments(%{"installmentsCount" => n}) when is_integer(n) and n > 0, do: n
  defp extract_card_installments(_), do: nil

  @doc """
  Returns the card installment cap for a given order total.

  Each installment must be worth at least R$10 (1_000 cents), capped at the
  configured maximum (default 3). Always returns at least 1 so single-payment
  stays available on tiny orders.
  """
  def max_card_installments(total_cents) do
    if total_cents <= 20000 do
      1
    else
      cap = Application.get_env(:backend, :max_card_installments, 3)
      by_value = div(total_cents, 1_000)
      max(1, min(cap, by_value))
    end
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
