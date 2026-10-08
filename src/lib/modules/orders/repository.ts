import type { Queryable } from '$lib/db/queryable';
import type { EventOrderRow, OrderItemRow, OrderRow, PassRow, ValidatedCountRow } from './types';

export interface OrderRepository {
    /** Every order `userId` placed, newest first. */
    listForBuyer(userId: string): Promise<OrderRow[]>;

    /** Order `orderId` if `userId` placed it. Null otherwise. */
    findForBuyer(orderId: string, userId: string): Promise<OrderRow | null>;

    /** The items of every order in `orderIds`, in insertion order. */
    listItems(orderIds: readonly string[]): Promise<OrderItemRow[]>;

    /** The passes issued for `orderId`, in issue order. */
    listPasses(orderId: string): Promise<PassRow[]>;

    /** Every order on `eventId` with its buyer, newest first. */
    listForEvent(eventId: string): Promise<EventOrderRow[]>;

    /** How many ticket passes of each order were scanned; orders with none are absent. */
    countValidatedTickets(orderIds: readonly string[]): Promise<ValidatedCountRow[]>;
}

export function getOrderRepository({ queryable }: { queryable: Queryable }): OrderRepository {
    return {
        listForBuyer(userId) {
            const sql = `
                select ${ORDER_COLUMNS}
                from orders o join events e on e.id = o.event_id
                where o.user_id = $1
                order by o.inserted_at desc`;
            return queryable.query<OrderRow>(sql, [userId]);
        },

        async findForBuyer(orderId, userId) {
            const sql = `
                select ${ORDER_COLUMNS}
                from orders o join events e on e.id = o.event_id
                where o.id = $1 and o.user_id = $2`;
            const rows = await queryable.query<OrderRow>(sql, [orderId, userId]);
            return rows[0] ?? null;
        },

        listItems(orderIds) {
            if (orderIds.length === 0) return Promise.resolve([]);
            const sql = `
                select id, order_id, item_type, item_id, item_name, quantity, unit_price_cents
                from order_items
                where order_id = any($1::uuid[])
                order by inserted_at asc, id asc`;
            return queryable.query<OrderItemRow>(sql, [orderIds]);
        },

        listForEvent(eventId) {
            const sql = `
                select o.id, u.name as buyer_name, u.email as buyer_email, u.cellphone as buyer_phone,
                       o.status, o.total_cents, o.payment_method, o.paid_at, o.inserted_at
                from orders o join users u on u.id = o.user_id
                where o.event_id = $1
                order by o.inserted_at desc`;
            return queryable.query<EventOrderRow>(sql, [eventId]);
        },

        countValidatedTickets(orderIds) {
            if (orderIds.length === 0) return Promise.resolve([]);
            const sql = `
                select order_id, count(*)::int as validated
                from passes
                where order_id = any($1::uuid[]) and kind = 'ticket' and checked_in_at is not null
                group by order_id`;
            return queryable.query<ValidatedCountRow>(sql, [orderIds]);
        },

        listPasses(orderId) {
            const sql = `
                select id, order_id, kind, item_name, token, checked_in_at
                from passes
                where order_id = $1
                order by inserted_at asc, id asc`;
            return queryable.query<PassRow>(sql, [orderId]);
        }
    };
}

const ORDER_COLUMNS = `
    o.id, o.user_id, o.event_id, e.title as event_title, o.status, o.total_cents,
    o.abacate_payment_url, o.paid_at, o.inserted_at
`;
