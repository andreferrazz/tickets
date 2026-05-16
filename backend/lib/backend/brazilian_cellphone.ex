defmodule Backend.BrazilianCellphone do
  @moduledoc """
  Strict validator/normalizer for Brazilian mobile numbers.

  Accepts user input in any format (with or without country code, spaces,
  parentheses, or dashes) and returns the value in E.164 (`+55DDDXXXXXXXXX`)
  when it represents a Brazilian mobile. Only mobiles are accepted: after
  stripping the optional country code we require exactly 11 digits with the
  mobile `9` prefix right after the DDD.

  Used by `Backend.Accounts.User.profile_changeset/2` so obvious typos fail
  locally before any Abacate Pay call.
  """

  @doc """
  Normalizes `input` to `+55DDDXXXXXXXXX` when it is a Brazilian mobile.

  Returns `{:ok, e164}` or `:error`.
  """
  def normalize(input) when is_binary(input) do
    input
    |> String.replace(~r/\D/, "")
    |> strip_country_code()
    |> validate_mobile()
  end

  def normalize(_), do: :error

  defp strip_country_code("55" <> rest) when byte_size(rest) == 11, do: rest
  defp strip_country_code(other), do: other

  defp validate_mobile(<<d1, _d2, ?9, _rest::binary-size(8)>> = digits) when d1 in ?1..?9 do
    {:ok, "+55" <> digits}
  end

  defp validate_mobile(_), do: :error
end
