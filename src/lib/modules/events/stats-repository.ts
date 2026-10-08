import type { Queryable } from '$lib/db/queryable';
import type {
    BuyersKind,
    ItemBuyerRow,
    ItemRevenueRow,
    PaidOrderRow,
    PassTotalsRow,
    RecentOrderRow
} from './stats-types';

/** The aggregate queries behind the creator dashboard. All scoped to one event. */
export interface EventStatsRepository {
    countPendingOrders(eventId: string): Promise<number>;
    listPaidOrders(eventId: string): Promise<PaidOrderRow[]>;
    passTotals(eventId: string): Promise<PassTotalsRow>;
    /** Paid revenue per item of `kind`: pending holds and refunds earn nothing. */
    paidRevenueByItem(eventId: string, kind: BuyersKind): Promise<ItemRevenueRow[]>;
    listRecentOrders(eventId: string, limit: number): Promise<RecentOrderRow[]>;
    /** Payout amounts that reduce what can still be withdrawn. */
    deductedPayoutCents(eventId: string): Promise<number>;
    lastPayoutAt(eventId: string): Promise<Date | null>;
    /** One row per buyer of the item, pending and paid orders summed, largest first. */
    listItemBuyers(kind: BuyersKind, itemId: string): Promise<ItemBuyerRow[]>;
}

// Payout statuses that hold or have taken money (Backend.Payouts @blocking_statuses).
const BLOCKING_PAYOUT_STATUSES = ['pending', 'complete', 'refunded', 'expired'];

export function getEventStatsRepository({
    queryable
}: {
    queryable: Queryable;
}): EventStatsRepository {
    return {
        async countPendingOrders(eventId) {
            const sql = `select count(*)::int as n from orders where event_id = $1 and status = 'pending'`;
            return (await queryable.query<{ n: number }>(sql, [eventId]))[0]?.n ?? 0;
        },

        listPaidOrders(eventId) {
            const sql = `
                select total_cents, payment_method, card_installments, platform_fee_cents
                from orders where event_id = $1 and status = 'paid'`;
            return queryable.query<PaidOrderRow>(sql, [eventId]);
        },

        async passTotals(eventId) {
            const sql = `
                select count(id)::int as issued, count(checked_in_at)::int as checked_in
                from passes where event_id = $1`;
            return (
                (await queryable.query<PassTotalsRow>(sql, [eventId]))[0] ?? {
                    issued: 0,
                    checked_in: 0
                }
            );
        },

        paidRevenueByItem(eventId, kind) {
            const sql = `
                select oi.item_id, coalesce(sum(oi.quantity * oi.unit_price_cents), 0)::int as revenue_cents
                from order_items oi join orders o on o.id = oi.order_id
                where o.event_id = $1 and o.status = 'paid' and oi.item_type = $2
                group by oi.item_id`;
            return queryable.query<ItemRevenueRow>(sql, [eventId, kind]);
        },

        listRecentOrders(eventId, limit) {
            const sql = `
                select o.id, u.email as buyer_email, o.status, o.total_cents, o.paid_at, o.inserted_at,
                       coalesce(sum(oi.quantity), 0)::int as item_count
                from orders o
                join users u on u.id = o.user_id
                left join order_items oi on oi.order_id = o.id
                where o.event_id = $1
                group by o.id, u.email
                order by o.inserted_at desc
                limit $2`;
            return queryable.query<RecentOrderRow>(sql, [eventId, limit]);
        },

        async deductedPayoutCents(eventId) {
            const sql = `
                select coalesce(sum(amount_cents), 0)::int as n from payouts
                where event_id = $1 and status = any($2)`;
            const rows = await queryable.query<{ n: number }>(sql, [
                eventId,
                BLOCKING_PAYOUT_STATUSES
            ]);
            return rows[0]?.n ?? 0;
        },

        async lastPayoutAt(eventId) {
            const sql = `
                select inserted_at from payouts
                where event_id = $1 and status = any($2)
                order by inserted_at desc limit 1`;
            const rows = await queryable.query<{ inserted_at: Date }>(sql, [
                eventId,
                BLOCKING_PAYOUT_STATUSES
            ]);
            return rows[0]?.inserted_at ?? null;
        },

        listItemBuyers(kind, itemId) {
            const sql = `
                select u.name, u.tax_id, u.email, sum(oi.quantity)::int as quantity
                from order_items oi
                join orders o on o.id = oi.order_id
                join users u on u.id = o.user_id
                where oi.item_type = $1 and oi.item_id = $2 and o.status in ('pending', 'paid')
                group by u.id, u.name, u.tax_id, u.email
                order by sum(oi.quantity) desc, u.name asc`;
            return queryable.query<ItemBuyerRow>(sql, [kind, itemId]);
        }
    };
}
