import type { CheckoutStatus, PayoutStatus } from './gateway';

// Unknown states map to `pending` on purpose: the reconciler treats pending as
// "not yet terminal" and retries next cycle instead of releasing stock on a
// status Abacate added after this was written.
const CHECKOUT_STATUSES: readonly CheckoutStatus[] = [
    'paid',
    'pending',
    'cancelled',
    'expired',
    'refunded'
];
const PAYOUT_STATUSES: readonly PayoutStatus[] = [
    'pending',
    'complete',
    'failed',
    'cancelled',
    'refunded',
    'expired'
];

/** Abacate's upper-case checkout status to ours; anything unknown is `pending`. */
export function normalizeCheckoutStatus(status: string | undefined): CheckoutStatus {
    const lower = status?.toLowerCase() ?? '';
    return CHECKOUT_STATUSES.find((known) => known === lower) ?? 'pending';
}

/** Abacate's upper-case payout status to ours; anything unknown is `pending`. */
export function normalizePayoutStatus(status: string | undefined): PayoutStatus {
    const lower = status?.toLowerCase() ?? '';
    return PAYOUT_STATUSES.find((known) => known === lower) ?? 'pending';
}
