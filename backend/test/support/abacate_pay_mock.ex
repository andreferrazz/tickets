defmodule Backend.AbacatePayMock do
  @moduledoc """
  Test stub for the Abacate Pay HTTP client. Returns deterministic results.

  `get_checkout/1` honours per-checkout overrides set with `put_checkout/2`
  (test-process-scoped via the process dictionary). The default is a
  pending checkout — tests opt into other states explicitly.
  """

  @behaviour Backend.AbacatePayBehaviour

  @impl Backend.AbacatePayBehaviour
  def create_product(_name, _price_cents, external_id) do
    {:ok, "prod_test_#{external_id}"}
  end

  @impl Backend.AbacatePayBehaviour
  def create_checkout(_items, _return_url, completion_url, _customer_id, _total_cents, _methods) do
    {:ok, %{id: "bill_test_#{:rand.uniform(99_999)}", url: completion_url}}
  end

  @impl Backend.AbacatePayBehaviour
  def create_boleto(_total_cents, _name, _tax_id) do
    id = "bole_test_#{:rand.uniform(99_999)}"

    {:ok,
     %{
       id: id,
       url: "https://app.abacatepay.com/pay/#{id}/boleto",
       expires_at: DateTime.utc_now() |> DateTime.add(3, :day) |> DateTime.to_iso8601()
     }}
  end

  @impl Backend.AbacatePayBehaviour
  def create_customer(_email, _name, _cellphone, tax_id) do
    {:ok, "cust_test_#{tax_id}"}
  end

  @impl Backend.AbacatePayBehaviour
  def get_checkout(checkout_id) do
    case Process.get({__MODULE__, :checkout, checkout_id}) do
      nil ->
        {:ok, %{status: "pending", payment_method: nil, card_installments: nil}}

      {:error, _} = err ->
        err

      result when is_map(result) ->
        {:ok,
         Map.merge(%{status: "pending", payment_method: nil, card_installments: nil}, result)}
    end
  end

  @impl Backend.AbacatePayBehaviour
  def get_transparent(transparent_id) do
    case Process.get({__MODULE__, :checkout, transparent_id}) do
      nil ->
        {:ok, %{status: "pending", payment_method: "BOLETO", card_installments: nil}}

      {:error, _} = err ->
        err

      result when is_map(result) ->
        {:ok,
         Map.merge(%{status: "pending", payment_method: "BOLETO", card_installments: nil}, result)}
    end
  end

  @doc """
  Overrides what `get_checkout/1` and `get_transparent/1` return for `checkout_id`
  in the current test process. Pass a map for a success response (merged onto the
  defaults) or `{:error, reason}` to drive the error branch.
  """
  def put_checkout(checkout_id, response) do
    Process.put({__MODULE__, :checkout, checkout_id}, response)
    :ok
  end

  @impl Backend.AbacatePayBehaviour
  def create_payout(_amount, external_id, _description, _pix_key, _pix_key_type) do
    case Process.get({__MODULE__, :payout, external_id}) do
      nil ->
        {:ok,
         %{
           id: "pyt_test_#{external_id}",
           status: "pending",
           receipt_url: nil
         }}

      {:error, _} = err ->
        err

      result when is_map(result) ->
        {:ok,
         Map.merge(
           %{id: "pyt_test_#{external_id}", status: "pending", receipt_url: nil},
           result
         )}
    end
  end

  @doc """
  Overrides `create_payout/5` response by `external_id` in the current test
  process. Pass a map (merged onto defaults) or `{:error, reason}`.
  """
  def put_payout(external_id, response) do
    Process.put({__MODULE__, :payout, external_id}, response)
    :ok
  end
end
