// Abacate Pay fee table, per the seller profile. Hardcoded because Abacate does
// not surface fees via API; update if the seller renegotiates. Ported unchanged
// from backend/lib/backend/abacate_pay.ex.
const PIX_FEE_CENTS = 80;
const CARD_FIXED_CENTS = 60;
const CARD_RATE_1X_BPS = 350;
const CARD_RATE_2_TO_6_BPS = 400;
const CARD_RATE_7_TO_12_BPS = 450;

const MAX_CARD_INSTALLMENTS = 3;
const MIN_INSTALLMENT_CENTS = 1_000;
/** Orders at or below this total are single-payment only. */
const INSTALLMENTS_FROM_CENTS = 20_000;

/**
 * Card installment cap for an order total: each installment is worth at least
 * R$10, capped at 3, and never below 1 so single payment stays available.
 *
 * @example
 * maxCardInstallments(15_000); // 1
 * maxCardInstallments(25_000); // 3
 */
export function maxCardInstallments(totalCents: number): number {
    if (totalCents <= INSTALLMENTS_FROM_CENTS) return 1;
    const byValue = Math.floor(totalCents / MIN_INSTALLMENT_CENTS);
    return Math.max(1, Math.min(MAX_CARD_INSTALLMENTS, byValue));
}

/**
 * The Abacate fee, in cents, deducted from the organizer's payout for an order
 * paid via `paymentMethod`. PIX is flat; CARD is a rate that grows with the
 * installment count plus a fixed part. Anything else, including null, is
 * treated as PIX: legacy paid orders predate payment-method tracking.
 *
 * @example
 * feeCents(10_000, 'PIX');      // 80
 * feeCents(10_000, 'CARD', 1);  // 410
 */
export function feeCents(
    totalCents: number,
    paymentMethod: string | null,
    installments: number | null = null
): number {
    if (paymentMethod !== 'CARD') return PIX_FEE_CENTS;
    return Math.floor((totalCents * cardRateBps(installments)) / 10_000) + CARD_FIXED_CENTS;
}

function cardRateBps(installments: number | null): number {
    if (installments !== null && installments >= 7 && installments <= 12) {
        return CARD_RATE_7_TO_12_BPS;
    }
    if (installments !== null && installments >= 2 && installments <= 6) {
        return CARD_RATE_2_TO_6_BPS;
    }
    return CARD_RATE_1X_BPS;
}
