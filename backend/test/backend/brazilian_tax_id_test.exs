defmodule Backend.BrazilianTaxIdTest do
  use ExUnit.Case, async: true

  alias Backend.BrazilianTaxId

  describe "valid?/1 with CPF" do
    test "accepts a known-good CPF" do
      assert BrazilianTaxId.valid?("11144477735")
    end

    test "rejects a CPF with a wrong check digit" do
      refute BrazilianTaxId.valid?("11144477736")
    end

    test "rejects a CPF with all the same digit" do
      refute BrazilianTaxId.valid?("11111111111")
    end

    test "rejects the historically-attempted sequential CPF" do
      refute BrazilianTaxId.valid?("12345678900")
      refute BrazilianTaxId.valid?("12345678901")
    end

    test "rejects values shorter than 11 digits" do
      refute BrazilianTaxId.valid?("1114447773")
    end
  end

  describe "valid?/1 with CNPJ" do
    test "accepts a known-good CNPJ" do
      assert BrazilianTaxId.valid?("11222333000181")
    end

    test "rejects a CNPJ with a wrong check digit" do
      refute BrazilianTaxId.valid?("11222333000180")
    end

    test "rejects all-same-digit CNPJs" do
      refute BrazilianTaxId.valid?("00000000000000")
    end
  end

  describe "valid?/1 with garbage input" do
    test "rejects non-binary input" do
      refute BrazilianTaxId.valid?(nil)
      refute BrazilianTaxId.valid?(11_144_477_735)
    end

    test "rejects empty strings and non-digit-length strings" do
      refute BrazilianTaxId.valid?("")
      refute BrazilianTaxId.valid?("abc")
    end
  end
end
