import type { Queryable } from '$lib/db/queryable';
import type { PayoutStatus, PixKeyType } from '$lib/types';
import type { PayoutRow } from './types';

export interface NewPayoutRow {
    id: string;
    eventId: string;
    requestedById: string;
    amountCents: number;
    pixKey: string;
    pixKeyType: PixKeyType;
    /** Our own id for it, which Abacate Pay uses as the idempotency key. */
    externalId: string;
}

export interface PayoutSettlement {
    status: PayoutStatus;
    abacatePayoutId: string | null;
    receiptUrl: string | null;
    errorMessage: string | null;
}

export interface PayoutRepository {
    /** The newest payouts of the event, whatever became of them. */
    listRecent(eventId: string, limit: number): Promise<PayoutRow[]>;
    /**
     * Makes this transaction the only one deciding on a payout for `eventId`
     * until it ends: a second request waits here, then sees the first one's row.
     */
    lockEvent(db: Queryable, eventId: string): Promise<void>;
    /** Whether a payout that holds or took money was requested in the last `hours`. */
    hasRecentBlocking(db: Queryable, eventId: string, hours: number): Promise<boolean>;
    insertPending(db: Queryable, row: NewPayoutRow): Promise<void>;
    settle(payoutId: string, settlement: PayoutSettlement): Promise<void>;
}

// Statuses that hold or have taken money (`Backend.Payouts` @blocking_statuses).
// A failed or cancelled attempt took nothing, so it must not lock the leader
// out for a day.
const BLOCKING_STATUSES: readonly PayoutStatus[] = ['pending', 'complete', 'refunded', 'expired'];
const NOW = "now() at time zone 'utc'";

export function getPayoutRepository({ queryable }: { queryable: Queryable }): PayoutRepository {
    return {
        listRecent(eventId, limit) {
            const sql = `
                select id, amount_cents, status, pix_key, pix_key_type, receipt_url, inserted_at
                from payouts where event_id = $1
                order by inserted_at desc, id desc limit $2`;
            return queryable.query<PayoutRow>(sql, [eventId, limit]);
        },

        async lockEvent(db, eventId) {
            await db.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
                `payout:${eventId}`
            ]);
        },

        async hasRecentBlocking(db, eventId, hours) {
            const sql = `
                select 1 from payouts
                where event_id = $1 and status = any($2::text[])
                  and inserted_at > ${NOW} - make_interval(hours => $3)
                limit 1`;
            return (await db.query(sql, [eventId, BLOCKING_STATUSES, hours])).length > 0;
        },

        async insertPending(db, row) {
            const sql = `
                insert into payouts (id, event_id, requested_by_id, amount_cents, pix_key, pix_key_type,
                                     external_id, status, inserted_at, updated_at)
                values ($1, $2, $3, $4, $5, $6, $7, 'pending', ${NOW}, ${NOW})`;
            const params = [
                row.id,
                row.eventId,
                row.requestedById,
                row.amountCents,
                row.pixKey,
                row.pixKeyType,
                row.externalId
            ];
            await db.query(sql, params);
        },

        async settle(payoutId, settlement) {
            const sql = `
                update payouts
                set status = $2, abacate_payout_id = $3, receipt_url = $4, error_message = $5,
                    updated_at = ${NOW}
                where id = $1`;
            const params = [
                payoutId,
                settlement.status,
                settlement.abacatePayoutId,
                settlement.receiptUrl,
                settlement.errorMessage
            ];
            await queryable.query(sql, params);
        }
    };
}
