import { AbacatePayError, describeAbacateFailure } from '$lib/integrations/abacate-pay/errors';
import type { AbacatePayGateway, PaymentState } from '$lib/integrations/abacate-pay/gateway';
import type { OrderFulfilment } from './fulfilment-service';
import type { OrderStateRepository, StalePendingOrderRow } from './order-state-repository';
import type { StockReservation } from './stock-reservation';

export interface ReconciliationTally {
    /** Paid at Abacate Pay without our knowing: marked paid and fulfilled. */
    recovered: number;
    /** Given up on: marked expired, stock released. */
    expired: number;
    /** Left pending: a boleto still within its term, or Abacate Pay did not answer. */
    kept: number;
}

/**
 * Settles pending orders that outlived their welcome, as Phoenix's
 * `ExpiryWorker` did. Each one older than fifteen minutes is checked against
 * Abacate Pay: paid there means a webhook was missed, so the order is
 * fulfilled; anything else expires it and frees its stock. A boleto is the
 * exception, held until its own due date because it takes days to pay.
 *
 * An order Abacate Pay cannot be asked about is left alone for the next run.
 * Never expiring on an upstream failure is the point: that was the bug the
 * worker was written to prevent.
 *
 * @example
 * const tally = await orderReconciler.run('https://tickets.example.com');
 * // { recovered: 1, expired: 4, kept: 0 }
 */
export interface OrderReconciler {
    /** `origin` is the site's own, for the order link in a recovered order's emails. */
    run(origin: string): Promise<ReconciliationTally>;
}

export interface OrderReconcilerDeps {
    orderStates: OrderStateRepository;
    stock: StockReservation;
    fulfilment: OrderFulfilment;
    abacatePay: AbacatePayGateway;
}

// Long enough for a buyer to finish a checkout before we ask about it.
const MIN_PENDING_MINUTES = 15;

type Verdict = keyof ReconciliationTally;

export function getOrderReconciler(deps: OrderReconcilerDeps): OrderReconciler {
    const expire = async (order: StalePendingOrderRow): Promise<Verdict> => {
        const released = await deps.stock.release({
            orderId: order.id,
            from: ['pending'],
            to: 'expired',
            deletePasses: false
        });
        // False when a webhook or a cancellation got to the order first.
        return released ? 'expired' : 'kept';
    };

    const recover = async (
        order: StalePendingOrderRow,
        payment: PaymentState,
        origin: string
    ): Promise<Verdict> => {
        await deps.orderStates.markPaid(order.id, payment);
        await deps.fulfilment.fulfil(order.id, origin);
        return 'recovered';
    };

    const reconcile = async (order: StalePendingOrderRow, origin: string): Promise<Verdict> => {
        // It never reached Abacate Pay, so there is nobody to ask and nothing to wait for.
        if (!order.abacate_checkout_id) return expire(order);
        const boleto = order.payment_method === 'BOLETO';
        const upstream = boleto
            ? await deps.abacatePay.getTransparent(order.abacate_checkout_id)
            : await deps.abacatePay.getCheckout(order.abacate_checkout_id);
        if (upstream.status === 'paid') return recover(order, upstream, origin);
        // Abacate Pay has no way to cancel a hosted checkout, so one still open
        // there is expired here anyway; a late payment still arrives by webhook.
        const waiting = boleto && upstream.status === 'pending' && !pastDue(order);
        return waiting ? 'kept' : expire(order);
    };

    return {
        async run(origin) {
            const tally: ReconciliationTally = { recovered: 0, expired: 0, kept: 0 };
            for (const order of await deps.orderStates.listStalePending(MIN_PENDING_MINUTES)) {
                tally[await reconcileOrSkip(order, () => reconcile(order, origin))] += 1;
            }
            return tally;
        }
    };
}

// A boleto with no recorded due date is never past it: stock is not released
// on a payment the buyer can still make.
function pastDue(order: StalePendingOrderRow): boolean {
    return order.expires_at !== null && order.expires_at.getTime() < Date.now();
}

// One order failing must not stop the sweep; it stays pending and is retried
// by the next one.
async function reconcileOrSkip(
    order: StalePendingOrderRow,
    reconcile: () => Promise<Verdict>
): Promise<Verdict> {
    try {
        return await reconcile();
    } catch (cause) {
        const event = 'order_reconcile_skipped';
        // An Abacate error is described, never printed: its message can echo buyer data.
        const failure =
            cause instanceof AbacatePayError
                ? describeAbacateFailure(cause)
                : { error: String(cause) };
        console.warn(JSON.stringify({ level: 'warn', event, orderId: order.id, ...failure }));
        return 'kept';
    }
}
