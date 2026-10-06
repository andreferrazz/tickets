import type { Queryable } from '$lib/db/queryable';
import type { OrderItemRow, OrderRow, PassRow } from './types';

export interface OrderRepository {
    /** Every order `userId` placed, newest first. */
    listForBuyer(userId: string): Promise<OrderRow[]>;

    /** Order `orderId` if `userId` placed it. Null otherwise. */
    findForBuyer(orderId: string, userId: string): Promise<OrderRow | null>;

    /** The items of every order in `orderIds`, in insertion order. */
    listItems(orderIds: readonly string[]): Promise<OrderItemRow[]>;

    /** The passes issued for `orderId`, in issue order. */
    listPasses(orderId: string): Promise<PassRow[]>;
}

export function getOrderRepository(queryable: Queryable): OrderRepository {
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
