defmodule Backend.AbacatePayTest do
  use ExUnit.Case, async: true

  alias Backend.AbacatePay

  describe "max_card_installments/1" do
    test "orders smallest or equal to R$200 should have at most 1 installment" do
      assert AbacatePay.max_card_installments(100) == 1
      assert AbacatePay.max_card_installments(10_000) == 1
      assert AbacatePay.max_card_installments(20_000) == 1
    end

    test "orders larger than R$200 should have 3 installments" do
      assert AbacatePay.max_card_installments(20_001) == 3
      assert AbacatePay.max_card_installments(50_000) == 3
      assert AbacatePay.max_card_installments(99_999_99) == 3
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
