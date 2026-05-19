defmodule Backend.AbacatePayTest do
  use ExUnit.Case, async: true

  alias Backend.AbacatePay

  describe "max_card_installments/1" do
    test "caps at 3 for large orders" do
      assert AbacatePay.max_card_installments(10_000) == 3
      assert AbacatePay.max_card_installments(99_999_99) == 3
    end

    test "scales down so each installment is at least R$10" do
      # R$25 → 2 installments of R$12.50
      assert AbacatePay.max_card_installments(2_500) == 2

      # R$10 → 1 installment (can't split below R$10/each)
      assert AbacatePay.max_card_installments(1_000) == 1

      # R$30 → 3 installments of R$10
      assert AbacatePay.max_card_installments(3_000) == 3
    end

    test "never returns less than 1 (single-payment must stay available)" do
      assert AbacatePay.max_card_installments(0) == 1
      assert AbacatePay.max_card_installments(500) == 1
    end
  end
end
