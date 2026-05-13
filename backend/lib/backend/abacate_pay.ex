defmodule Backend.AbacatePay do
  @moduledoc """
  HTTP client for the Abacate Pay API v2.

  Base URL: https://api.abacatepay.com/v2
  Auth: Authorization: Bearer <api_key>
  """

  @behaviour Backend.AbacatePayBehaviour

  @base_url "https://api.abacatepay.com/v2"

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
  Creates a checkout session with the given product items.

  Returns `{:ok, %{id: bill_id, url: payment_url}}`.
  """
  @impl Backend.AbacatePayBehaviour
  def create_checkout(items, return_url, completion_url) do
    body = %{
      items: items,
      methods: ["PIX"],
      returnUrl: return_url,
      completionUrl: completion_url
    }

    case Req.post("#{@base_url}/checkouts/create", json: body, headers: [auth_header()]) do
      {:ok, %{status: 200, body: %{"data" => %{"id" => id, "url" => url}}}} ->
        {:ok, %{id: id, url: url}}

      {:ok, %{status: status, body: body}} ->
        {:error, "abacate_pay checkout #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
