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
  def create_checkout(_items, _return_url, completion_url, _customer_id, _total_cents) do
    {:ok, %{id: "bill_test_#{:rand.uniform(99_999)}", url: completion_url}}
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

  @doc """
  Overrides what `get_checkout/1` returns for `checkout_id` in the current
  test process. Pass a map for a success response (merged onto the defaults)
  or `{:error, reason}` to drive the error branch.
  """
  def put_checkout(checkout_id, response) do
    Process.put({__MODULE__, :checkout, checkout_id}, response)
    :ok
  end
end
