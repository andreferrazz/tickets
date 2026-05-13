defmodule Backend.AbacatePayMock do
  @moduledoc "Test stub for the Abacate Pay HTTP client. Returns deterministic results."

  @behaviour Backend.AbacatePayBehaviour

  @impl Backend.AbacatePayBehaviour
  def create_product(_name, _price_cents, external_id) do
    {:ok, "prod_test_#{external_id}"}
  end

  @impl Backend.AbacatePayBehaviour
  def create_checkout(_items, _return_url, completion_url) do
    {:ok, %{id: "bill_test_#{:rand.uniform(99_999)}", url: completion_url}}
  end
end
