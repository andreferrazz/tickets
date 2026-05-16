defmodule Backend.BrazilianCellphoneTest do
  use ExUnit.Case, async: true

  alias Backend.BrazilianCellphone

  describe "normalize/1 happy paths" do
    test "accepts a bare 11-digit mobile" do
      assert {:ok, "+5511999999999"} = BrazilianCellphone.normalize("11999999999")
    end

    test "accepts an E.164 string with the + sign" do
      assert {:ok, "+5511999999999"} = BrazilianCellphone.normalize("+5511999999999")
    end

    test "accepts a number with the country code but no +" do
      assert {:ok, "+5531998765432"} = BrazilianCellphone.normalize("5531998765432")
    end

    test "ignores spaces, parentheses, and dashes" do
      assert {:ok, "+5511987654321"} = BrazilianCellphone.normalize("(11) 98765-4321")
      assert {:ok, "+5511987654321"} = BrazilianCellphone.normalize("+55 11 98765-4321")
    end
  end

  describe "normalize/1 rejections" do
    test "rejects landlines (no 9 prefix)" do
      assert :error = BrazilianCellphone.normalize("1133334444")
      assert :error = BrazilianCellphone.normalize("+551133334444")
    end

    test "rejects mobiles missing the 9 prefix after DDD" do
      assert :error = BrazilianCellphone.normalize("11888888888")
    end

    test "rejects DDDs starting with zero" do
      assert :error = BrazilianCellphone.normalize("01999999999")
    end

    test "rejects values shorter than 11 digits" do
      assert :error = BrazilianCellphone.normalize("9999999999")
    end

    test "rejects values longer than 11 digits without a 55 prefix" do
      assert :error = BrazilianCellphone.normalize("119999999999")
    end

    test "rejects non-binary input" do
      assert :error = BrazilianCellphone.normalize(nil)
      assert :error = BrazilianCellphone.normalize(11_999_999_999)
    end

    test "rejects empty string" do
      assert :error = BrazilianCellphone.normalize("")
    end
  end
end
