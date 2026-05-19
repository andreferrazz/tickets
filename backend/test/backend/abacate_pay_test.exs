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

  describe "fee_cents/3" do
    test "PIX is a flat R$0,80 regardless of total" do
      assert AbacatePay.fee_cents(1_000, "PIX") == 80
      assert AbacatePay.fee_cents(50_000, "PIX", nil) == 80
      assert AbacatePay.fee_cents(1_000_000, "PIX", 1) == 80
    end

    test "card 1x is 3.50% + R$0,60" do
      # R$100 → 350 + 60 = 410
      assert AbacatePay.fee_cents(10_000, "CARD", 1) == 410
      # nil installments fall back to 1x
      assert AbacatePay.fee_cents(10_000, "CARD") == 410
    end

    test "card 2x-6x is 4.00% + R$0,60" do
      # R$100 → 400 + 60 = 460
      assert AbacatePay.fee_cents(10_000, "CARD", 2) == 460
      assert AbacatePay.fee_cents(10_000, "CARD", 6) == 460
    end

    test "card 7x-12x is 4.50% + R$0,60" do
      # R$100 → 450 + 60 = 510
      assert AbacatePay.fee_cents(10_000, "CARD", 7) == 510
      assert AbacatePay.fee_cents(10_000, "CARD", 12) == 510
    end

    test "unknown method or nil falls back to PIX (legacy orders)" do
      assert AbacatePay.fee_cents(10_000, nil) == 80
      assert AbacatePay.fee_cents(10_000, "BOLETO") == 80
    end
  end
end
