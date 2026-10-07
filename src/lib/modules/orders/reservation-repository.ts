import type { Queryable } from '$lib/db/queryable';
import type { OrderStatus } from '$lib/types';
import type { CartItemType, ReservableLine } from './checkout-types';

/** A live ticket type with the batch it currently sells; the batch columns are null when none is open. */
export interface SellableTicketRow {
    ticket_type_id: string;
    event_id: string;
    name: string;
    batch_id: string | null;
    price_cents: number | null;
    abacate_product_id: string | null;
    remaining: number | null;
}

/** A live extra. `remaining` is null when its stock is unlimited. */
export interface SellableExtraRow {
    id: string;
    event_id: string;
    name: string;
    price_cents: number;
    abacate_product_id: string | null;
    remaining: number | null;
    limit_to_ticket_count: boolean;
}

export interface ReservedItemRow {
    item_type: CartItemType;
    item_id: string;
    batch_id: string | null;
    quantity: number;
}

/**
 * Stock and the order rows that hold it. Every write takes the transaction it
 * belongs to: an order, its items and the stock they reserve are one unit.
 */
export interface ReservationRepository {
    findSellableTicket(ticketTypeId: string): Promise<SellableTicketRow | null>;
    findSellableExtra(extraId: string): Promise<SellableExtraRow | null>;

    /** A pending order; returns its id. */
    insertOrder(
        db: Queryable,
        userId: string,
        eventId: string,
        totalCents: number
    ): Promise<string>;
    insertItem(db: Queryable, orderId: string, line: ReservableLine): Promise<void>;

    /**
     * Takes `quantity` from an open batch if that many are left, in one
     * statement, closing the batch when this sells it out. False when the
     * stock is gone: two buyers racing for the last ticket cannot both win.
     */
    reserveBatch(db: Queryable, batchId: string, quantity: number): Promise<boolean>;
    reserveExtra(db: Queryable, extraId: string, quantity: number): Promise<boolean>;

    listReservedItems(db: Queryable, orderId: string): Promise<ReservedItemRow[]>;
    /** Gives stock back; a batch that only closed because it sold out reopens. */
    releaseBatch(db: Queryable, batchId: string, quantity: number): Promise<void>;
    releaseExtra(db: Queryable, extraId: string, quantity: number): Promise<void>;

    /** Moves the order to `to` if it is still in one of `from`; false when it is not. */
    claimStatus(
        db: Queryable,
        orderId: string,
        from: readonly OrderStatus[],
        to: OrderStatus
    ): Promise<boolean>;
}

const NOW = "now() at time zone 'utc'";

export function getReservationRepository(queryable: Queryable): ReservationRepository {
    return {
        // The open batch with the lowest sequence is the one on sale, as
        // `Backend.Events.active_batch/1` picked it.
        async findSellableTicket(ticketTypeId) {
            const sql = `
                select t.id as ticket_type_id, t.event_id, t.name, b.id as batch_id, b.price_cents,
                       b.abacate_product_id, b.quantity_total - b.quantity_sold as remaining
                from ticket_types t
                left join lateral (
                    select id, price_cents, abacate_product_id, quantity_total, quantity_sold
                    from ticket_batches
                    where ticket_type_id = t.id and closed_at is null
                    order by sequence asc limit 1
                ) b on true
                where t.id = $1 and t.deleted_at is null`;
            return (await queryable.query<SellableTicketRow>(sql, [ticketTypeId]))[0] ?? null;
        },

        async findSellableExtra(extraId) {
            const sql = `
                select id, event_id, name, price_cents, abacate_product_id, limit_to_ticket_count,
                       quantity_total - quantity_sold as remaining
                from extra_items
                where id = $1 and deleted_at is null`;
            return (await queryable.query<SellableExtraRow>(sql, [extraId]))[0] ?? null;
        },

        async insertOrder(db, userId, eventId, totalCents) {
            const sql = `
                insert into orders (user_id, event_id, status, total_cents, inserted_at, updated_at)
                values ($1, $2, 'pending', $3, ${NOW}, ${NOW}) returning id`;
            const rows = await db.query<{ id: string }>(sql, [userId, eventId, totalCents]);
            if (!rows[0]) throw new Error(`insert order returned no row for event ${eventId}`);
            return rows[0].id;
        },

        async insertItem(db, orderId, line) {
            const sql = `
                insert into order_items (order_id, item_type, item_id, batch_id, item_name, quantity,
                                         unit_price_cents, inserted_at)
                values ($1, $2, $3, $4, $5, $6, $7, ${NOW})`;
            const params = [
                orderId,
                line.type,
                line.itemId,
                line.batchId,
                line.name,
                line.quantity,
                line.priceCents
            ];
            await db.query(sql, params);
        },

        async reserveBatch(db, batchId, quantity) {
            const sql = `
                update ticket_batches
                set quantity_sold = quantity_sold + $2,
                    closed_at = case when quantity_sold + $2 >= quantity_total then ${NOW} end,
                    auto_closed = quantity_sold + $2 >= quantity_total
                where id = $1 and closed_at is null and quantity_sold + $2 <= quantity_total
                returning id`;
            return (await db.query(sql, [batchId, quantity])).length > 0;
        },

        async reserveExtra(db, extraId, quantity) {
            const sql = `
                update extra_items set quantity_sold = quantity_sold + $2
                where id = $1 and deleted_at is null
                  and (quantity_total is null or quantity_sold + $2 <= quantity_total)
                returning id`;
            return (await db.query(sql, [extraId, quantity])).length > 0;
        },

        listReservedItems(db, orderId) {
            const sql = `select item_type, item_id, batch_id, quantity from order_items where order_id = $1`;
            return db.query<ReservedItemRow>(sql, [orderId]);
        },

        // A batch the creator closed by hand stays closed: only `auto_closed`
        // ones reopen, as `release_batch_stock/2` ruled.
        async releaseBatch(db, batchId, quantity) {
            const sql = `
                update ticket_batches
                set quantity_sold = quantity_sold - $2,
                    closed_at = case when auto_closed and quantity_sold - $2 < quantity_total
                                     then null else closed_at end,
                    auto_closed = auto_closed and quantity_sold - $2 >= quantity_total
                where id = $1`;
            await db.query(sql, [batchId, quantity]);
        },

        async releaseExtra(db, extraId, quantity) {
            const sql = `update extra_items set quantity_sold = quantity_sold - $2 where id = $1`;
            await db.query(sql, [extraId, quantity]);
        },

        async claimStatus(db, orderId, from, to) {
            const sql = `
                update orders set status = $3, updated_at = ${NOW}
                where id = $1 and status = any($2::text[]) returning id`;
            return (await db.query(sql, [orderId, from, to])).length > 0;
        }
    };
}
