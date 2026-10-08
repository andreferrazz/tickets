import type { Queryable } from '$lib/db/queryable';
import type { OrderStatus, PaymentMethod } from '$lib/types';

/** What deciding whether an order may be cancelled needs to know about it. */
export interface CancellableOrderRow {
    id: string;
    user_id: string;
    event_id: string;
    status: OrderStatus;
    total_cents: number;
    abacate_checkout_id: string | null;
    payment_method: PaymentMethod | null;
}

/** An order with who bought it and for what, for issuing and mailing its passes. */
export interface FulfilmentHeaderRow {
    id: string;
    user_id: string;
    event_id: string;
    buyer_email: string;
    event_title: string;
}

export interface AttachedCheckout {
    /** The `bill_*` or `bole_*` id the webhook and the reconciler match on. */
    id: string;
    url: string;
    paymentMethod: PaymentMethod;
    /** ISO 8601; only boletos carry one. */
    expiresAt: string | null;
}

export interface SettledPayment {
    paymentMethod: PaymentMethod | null;
    cardInstallments: number | null;
    /** Abacate's own figure for its fee, when the webhook reports it. */
    platformFeeCents?: number | null;
}

/** An order as the webhook finds it: by the checkout Abacate Pay is talking about. */
export interface CheckoutOrderRow {
    id: string;
    status: OrderStatus;
}

/** A pending order old enough for the reconciler to ask Abacate Pay about. */
export interface StalePendingOrderRow {
    id: string;
    abacate_checkout_id: string | null;
    payment_method: PaymentMethod | null;
    expires_at: Date | null;
}

const PENDING_ONLY: readonly OrderStatus[] = ['pending'];

/** The payment state of one order: what was opened at Abacate and whether it was paid. */
export interface OrderStateRepository {
    findCancellable(orderId: string): Promise<CancellableOrderRow | null>;
    findFulfilmentHeader(orderId: string): Promise<FulfilmentHeaderRow | null>;
    attachCheckout(orderId: string, checkout: AttachedCheckout): Promise<void>;
    /**
     * To paid, from one of `from` (pending unless said otherwise); false when
     * the order was in none of them.
     */
    markPaid(
        orderId: string,
        payment: SettledPayment,
        from?: readonly OrderStatus[]
    ): Promise<boolean>;
    /** The order a `bill_*` or `bole_*` id belongs to. */
    findByCheckout(checkoutId: string): Promise<CheckoutOrderRow | null>;
    /** Pending orders created more than `minutes` ago, oldest first. */
    listStalePending(minutes: number): Promise<StalePendingOrderRow[]>;
    /** Holds the order row until the transaction ends, so its passes are issued once. */
    lockOrder(db: Queryable, orderId: string): Promise<void>;
}

const NOW = "now() at time zone 'utc'";

export function getOrderStateRepository({
    queryable
}: {
    queryable: Queryable;
}): OrderStateRepository {
    return {
        async findCancellable(orderId) {
            const sql = `
                select id, user_id, event_id, status, total_cents, abacate_checkout_id, payment_method
                from orders where id = $1`;
            return (await queryable.query<CancellableOrderRow>(sql, [orderId]))[0] ?? null;
        },

        async findFulfilmentHeader(orderId) {
            const sql = `
                select o.id, o.user_id, o.event_id, u.email as buyer_email, e.title as event_title
                from orders o
                join users u on u.id = o.user_id
                join events e on e.id = o.event_id
                where o.id = $1`;
            return (await queryable.query<FulfilmentHeaderRow>(sql, [orderId]))[0] ?? null;
        },

        async attachCheckout(orderId, checkout) {
            const sql = `
                update orders
                set abacate_checkout_id = $2, abacate_payment_url = $3, payment_method = $4,
                    expires_at = $5::timestamptz at time zone 'utc', updated_at = ${NOW}
                where id = $1`;
            const params = [
                orderId,
                checkout.id,
                checkout.url,
                checkout.paymentMethod,
                checkout.expiresAt
            ];
            await queryable.query(sql, params);
        },

        // The method chosen at checkout stays when Abacate reports none.
        async markPaid(orderId, payment, from = PENDING_ONLY) {
            const sql = `
                update orders
                set status = 'paid', paid_at = ${NOW}, updated_at = ${NOW},
                    payment_method = coalesce($2, payment_method),
                    card_installments = coalesce($3, card_installments),
                    platform_fee_cents = coalesce($4, platform_fee_cents)
                where id = $1 and status = any($5::text[]) returning id`;
            const params = [
                orderId,
                payment.paymentMethod,
                payment.cardInstallments,
                payment.platformFeeCents ?? null,
                from
            ];
            return (await queryable.query(sql, params)).length > 0;
        },

        async findByCheckout(checkoutId) {
            const sql = `select id, status from orders where abacate_checkout_id = $1`;
            return (await queryable.query<CheckoutOrderRow>(sql, [checkoutId]))[0] ?? null;
        },

        listStalePending(minutes) {
            const sql = `
                select id, abacate_checkout_id, payment_method, expires_at
                from orders
                where status = 'pending' and inserted_at < ${NOW} - make_interval(mins => $1)
                order by inserted_at asc`;
            return queryable.query<StalePendingOrderRow>(sql, [minutes]);
        },

        async lockOrder(db, orderId) {
            await db.query(`select id from orders where id = $1 for update`, [orderId]);
        }
    };
}
