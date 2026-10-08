import type { Queryable } from '$lib/db/queryable';
import type { ExtraLineRow, IssuedPassRow, PassDraft, PassOwner, ScannedPassRow } from './types';

export interface PassRepository {
    findByToken(token: string): Promise<ScannedPassRow | null>;

    /**
     * Admits the pass if nobody has yet, in one statement, and says whether
     * this call was the one that did. Two scanners racing on the same code
     * cannot both be told "admitted".
     */
    claimCheckIn(passId: string, scannerId: string): Promise<boolean>;

    /** When the pass was admitted, as stored; null when it has not been. */
    findCheckedInAt(passId: string): Promise<Date | null>;

    /** The extra items of the order, in the order they were bought. */
    listExtraLines(orderId: string): Promise<ExtraLineRow[]>;

    /** The passes `orderId` already has, inside the transaction that may add them. */
    listIssued(db: Queryable, orderId: string): Promise<IssuedPassRow[]>;
    insertIssued(db: Queryable, owner: PassOwner, draft: PassDraft): Promise<IssuedPassRow>;
    /**
     * Removes every pass of the order. `checkIn` resolves a pass by its token
     * alone, so a cancelled free order's QR codes would otherwise keep working.
     */
    deleteForOrder(db: Queryable, orderId: string): Promise<void>;
}

const COLUMNS = 'id, kind, item_name, event_id, order_id, checked_in_at';
const ISSUED_COLUMNS = 'id, kind, item_name, token';
const NOW = "now() at time zone 'utc'";

export function getPassRepository({ queryable }: { queryable: Queryable }): PassRepository {
    return {
        async findByToken(token) {
            const sql = `select ${COLUMNS} from passes where token = $1`;
            return (await queryable.query<ScannedPassRow>(sql, [token]))[0] ?? null;
        },

        async claimCheckIn(passId, scannerId) {
            const sql = `
                update passes
                set checked_in_at = now() at time zone 'utc', checked_in_by_user_id = $2,
                    updated_at = now() at time zone 'utc'
                where id = $1 and checked_in_at is null
                returning id`;
            return (await queryable.query(sql, [passId, scannerId])).length > 0;
        },

        async findCheckedInAt(passId) {
            const sql = `select checked_in_at from passes where id = $1`;
            const rows = await queryable.query<{ checked_in_at: Date | null }>(sql, [passId]);
            return rows[0]?.checked_in_at ?? null;
        },

        listExtraLines(orderId) {
            const sql = `
                select item_name as name, quantity from order_items
                where order_id = $1 and item_type = 'extra'
                order by inserted_at asc, id asc`;
            return queryable.query<ExtraLineRow>(sql, [orderId]);
        },

        listIssued(db, orderId) {
            const sql = `
                select ${ISSUED_COLUMNS} from passes where order_id = $1
                order by inserted_at asc, id asc`;
            return db.query<IssuedPassRow>(sql, [orderId]);
        },

        async insertIssued(db, owner, draft) {
            const sql = `
                insert into passes (token, kind, item_name, order_id, order_item_id, event_id, user_id,
                                    inserted_at, updated_at)
                values ($1, $2, $3, $4, $5, $6, $7, ${NOW}, ${NOW})
                returning ${ISSUED_COLUMNS}`;
            const params = [
                draft.token,
                draft.kind,
                draft.itemName,
                owner.orderId,
                draft.orderItemId,
                owner.eventId,
                owner.userId
            ];
            const rows = await db.query<IssuedPassRow>(sql, params);
            if (!rows[0]) throw new Error(`insert pass returned no row for order ${owner.orderId}`);
            return rows[0];
        },

        async deleteForOrder(db, orderId) {
            await db.query(`delete from passes where order_id = $1`, [orderId]);
        }
    };
}
