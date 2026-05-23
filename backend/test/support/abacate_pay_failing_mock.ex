defmodule Backend.AbacatePayFailingMock do
  @moduledoc "Test stub that always fails. Used to exercise rollback paths."

  @behaviour Backend.AbacatePayBehaviour

  @impl Backend.AbacatePayBehaviour
  def create_product(_name, _price_cents, _external_id), do: {:error, :abacate_unavailable}

  @impl Backend.AbacatePayBehaviour
  def create_checkout(_items, _return_url, _completion_url, _customer_id, _total_cents),
    do: {:error, :abacate_unavailable}

  @impl Backend.AbacatePayBehaviour
  def create_customer(_email, _name, _cellphone, _tax_id),
    do: {:error, :abacate_unavailable}

  @impl Backend.AbacatePayBehaviour
  def get_checkout(_checkout_id), do: {:error, :abacate_unavailable}

  @impl Backend.AbacatePayBehaviour
  def create_payout(_amount, _external_id, _description, _pix_key, _pix_key_type),
    do: {:error, :abacate_unavailable}
end
