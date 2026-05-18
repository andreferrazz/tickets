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
  def create_checkout(items, return_url, completion_url, customer_id) do
    body =
      %{
        items: items,
        methods: ["PIX", "CARD"],
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
end
