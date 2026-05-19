defmodule Backend.AbacatePayBehaviour do
  @moduledoc "Callback contract for the Abacate Pay HTTP client."

  @callback create_product(
              name :: String.t(),
              price_cents :: integer(),
              external_id :: String.t()
            ) ::
              {:ok, prod_id :: String.t()} | {:error, any()}

  @callback create_checkout(
              items :: [%{id: String.t(), quantity: integer()}],
              return_url :: String.t(),
              completion_url :: String.t(),
              customer_id :: String.t() | nil,
              total_cents :: integer()
            ) ::
              {:ok, %{id: String.t(), url: String.t()}} | {:error, any()}

  @callback create_customer(
              email :: String.t(),
              name :: String.t(),
              cellphone :: String.t(),
              tax_id :: String.t()
            ) ::
              {:ok, customer_id :: String.t()} | {:error, any()}
end
