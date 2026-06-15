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
              total_cents :: integer(),
              methods :: [String.t()]
            ) ::
              {:ok, %{id: String.t(), url: String.t()}} | {:error, any()}

  @callback create_boleto(
              total_cents :: integer(),
              name :: String.t(),
              tax_id :: String.t()
            ) ::
              {:ok, %{id: String.t(), url: String.t(), expires_at: String.t() | nil}}
              | {:error, any()}

  @callback get_transparent(transparent_id :: String.t()) ::
              {:ok,
               %{
                 status: String.t(),
                 payment_method: String.t() | nil,
                 card_installments: pos_integer() | nil
               }}
              | {:error, any()}

  @callback create_customer(
              email :: String.t(),
              name :: String.t(),
              cellphone :: String.t(),
              tax_id :: String.t()
            ) ::
              {:ok, customer_id :: String.t()} | {:error, any()}

  @callback get_checkout(checkout_id :: String.t()) ::
              {:ok,
               %{
                 status: String.t(),
                 payment_method: String.t() | nil,
                 card_installments: pos_integer() | nil
               }}
              | {:error, any()}

  @callback create_payout(
              amount_cents :: integer(),
              external_id :: String.t(),
              description :: String.t() | nil,
              pix_key :: String.t(),
              pix_key_type :: String.t()
            ) ::
              {:ok,
               %{
                 id: String.t(),
                 status: String.t(),
                 receipt_url: String.t() | nil
               }}
              | {:error, any()}
end
