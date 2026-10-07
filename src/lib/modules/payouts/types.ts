import type { PayoutStatus, PixKeyType } from '$lib/types';

/** A row of `payouts`: one withdrawal of an event's revenue to a Pix key. */
export interface PayoutRow {
    id: string;
    amount_cents: number;
    status: PayoutStatus;
    /** The destination as it was when the payout was requested, not as it is now. */
    pix_key: string;
    pix_key_type: PixKeyType;
    receipt_url: string | null;
    inserted_at: Date;
}

/** What the withdraw dialog lists. */
export interface PayoutDto {
    id: string;
    amountCents: number;
    status: PayoutStatus;
    pixKey: string;
    pixKeyType: PixKeyType;
    receiptUrl: string | null;
    createdAt: string;
}

export interface PayoutDestination {
    pixKey: string;
    pixKeyType: string;
}

export type PayoutFailure =
    | 'not_found'
    | 'forbidden'
    | 'pix_key_missing'
    | 'invalid_amount'
    | 'insufficient_balance'
    | 'rate_limited'
    | 'abacate_refused'
    | 'abacate_unavailable';

export type DestinationFailure = 'not_found' | 'forbidden' | 'invalid_pix_key';

export type PayoutOutcome<Failure> = { ok: true } | { ok: false; failure: Failure };
