defmodule Backend.BrazilianTaxId do
  @moduledoc """
  Validates Brazilian tax identifiers (CPF for individuals, CNPJ for companies).

  Both formats carry trailing check digits derived from the leading digits via
  a weighted-sum modulo-11 algorithm. We validate locally so obviously bad
  numbers (typos, padding, all-same-digit values) are rejected before any
  upstream payment-provider call.

  Input is expected to be a digit-only string (`String.replace(s, ~r/\\D/, "")`
  happens at the changeset level).
  """

  @cpf_weights_1 [10, 9, 8, 7, 6, 5, 4, 3, 2]
  @cpf_weights_2 [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  @cnpj_weights_1 [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  @cnpj_weights_2 [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  @doc "Returns true when `digits` is a valid CPF (11 digits) or CNPJ (14 digits)."
  def valid?(digits) when is_binary(digits) do
    cond do
      String.length(digits) == 11 -> valid_cpf?(digits)
      String.length(digits) == 14 -> valid_cnpj?(digits)
      true -> false
    end
  end

  def valid?(_), do: false

  defp valid_cpf?(<<d::binary-size(11)>>) do
    not all_same_digits?(d) and check_digits_match?(d, @cpf_weights_1, @cpf_weights_2)
  end

  defp valid_cnpj?(<<d::binary-size(14)>>) do
    not all_same_digits?(d) and check_digits_match?(d, @cnpj_weights_1, @cnpj_weights_2)
  end

  defp all_same_digits?(<<c, _::binary>> = s) do
    String.duplicate(<<c>>, String.length(s)) == s
  end

  defp check_digits_match?(digits, weights_1, weights_2) do
    nums = digits |> String.graphemes() |> Enum.map(&String.to_integer/1)
    body = Enum.take(nums, length(weights_1))
    [d1, d2] = Enum.take(nums, -2)
    d1 == checksum(body, weights_1) and d2 == checksum(body ++ [d1], weights_2)
  end

  defp checksum(nums, weights) do
    sum = nums |> Enum.zip(weights) |> Enum.reduce(0, fn {n, w}, acc -> acc + n * w end)
    rem = rem(sum, 11)
    if rem < 2, do: 0, else: 11 - rem
  end
end
