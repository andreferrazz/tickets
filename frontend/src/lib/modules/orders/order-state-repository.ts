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
}

/** The payment state of one order: what was opened at Abacate and whether it was paid. */
export interface OrderStateRepository {
    findCancellable(orderId: string): Promise<CancellableOrderRow | null>;
    findFulfilmentHeader(orderId: string): Promise<FulfilmentHeaderRow | null>;
    attachCheckout(orderId: string, checkout: AttachedCheckout): Promise<void>;
    /** Pending to paid; false when the order was no longer pending. */
    markPaid(orderId: string, payment: SettledPayment): Promise<boolean>;
    /** Holds the order row until the transaction ends, so its passes are issued once. */
    lockOrder(db: Queryable, orderId: string): Promise<void>;
}

const NOW = "now() at time zone 'utc'";

export function getOrderStateRepository(queryable: Queryable): OrderStateRepository {
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
        async markPaid(orderId, payment) {
            const sql = `
                update orders
                set status = 'paid', paid_at = ${NOW}, updated_at = ${NOW},
                    payment_method = coalesce($2, payment_method),
                    card_installments = coalesce($3, card_installments)
                where id = $1 and status = 'pending' returning id`;
            const params = [orderId, payment.paymentMethod, payment.cardInstallments];
            return (await queryable.query(sql, params)).length > 0;
        },

        async lockOrder(db, orderId) {
            await db.query(`select id from orders where id = $1 for update`, [orderId]);
        }
    };
}
