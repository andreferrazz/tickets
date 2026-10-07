import type { AbacatePayGateway, PaymentState } from '$lib/integrations/abacate-pay/gateway';
import type { ManagedEventFinder } from '$lib/modules/events/managed-event';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { CancellationFailure, OrderOutcome } from './checkout-types';
import type { OrderFulfilment } from './fulfilment-service';
import type { CancellableOrderRow, OrderStateRepository } from './order-state-repository';
import type { StockReservation } from './stock-reservation';

type Cancelled = OrderOutcome<void, CancellationFailure>;

/**
 * Cancelling an order, as `Backend.Orders.cancel_order/2` and
 * `cancel_event_order/2` did. Only orders with no money collected qualify:
 * free ones (their passes go with them) and pending ones Abacate Pay confirms
 * are unpaid. A pending order that turns out to be paid, because the buyer
 * paid before the webhook landed, is fulfilled instead and the cancellation
 * refused.
 *
 * @example
 * const result = await orderCancellation.cancelForBuyer(user, params.id, url.origin);
 * if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
 */
export interface OrderCancellation {
    /** Someone else's order and a missing one are the same answer: `not_found`. */
    cancelForBuyer(buyer: SessionUser, orderId: string, origin: string): Promise<Cancelled>;
    /** For an admin or a manager of the event's organization; the order must be on `eventId`. */
    cancelForManager(
        manager: SessionUser,
        eventId: string,
        orderId: string,
        origin: string
    ): Promise<Cancelled>;
}

export interface OrderCancellationDeps {
    orderStates: OrderStateRepository;
    stock: StockReservation;
    managedEvents: ManagedEventFinder;
    abacatePay: AbacatePayGateway;
    fulfilment: OrderFulfilment;
}

const failed = (failure: CancellationFailure): Cancelled => ({ ok: false, failure });

export function getOrderCancellation(deps: OrderCancellationDeps): OrderCancellation {
    const find = async (orderId: string): Promise<CancellableOrderRow | null> =>
        isUuid(orderId) ? deps.orderStates.findCancellable(orderId) : null;

    const release = async (
        order: CancellableOrderRow,
        deletePasses: boolean
    ): Promise<Cancelled> => {
        const from = [order.status];
        const released = await deps.stock.release({
            orderId: order.id,
            from,
            to: 'cancelled',
            deletePasses
        });
        // Something else moved the order while this ran; it is no longer ours to cancel.
        return released ? { ok: true, value: undefined } : failed('not_cancellable');
    };

    const cancel = async (order: CancellableOrderRow, origin: string): Promise<Cancelled> => {
        if (order.status === 'paid' && order.total_cents === 0) return release(order, true);
        if (order.status !== 'pending') return failed('not_cancellable');
        const upstream = await paymentState(deps.abacatePay, order);
        if (upstream === 'unreachable') return failed('payment_check_failed');
        if (upstream?.status !== 'paid') return release(order, false);
        await recoverPaid(deps, order, upstream, origin);
        return failed('already_paid');
    };

    return {
        async cancelForBuyer(buyer, orderId, origin) {
            const order = await find(orderId);
            if (!order || order.user_id !== buyer.id) return failed('not_found');
            return cancel(order, origin);
        },

        async cancelForManager(manager, eventId, orderId, origin) {
            const event = await deps.managedEvents.find(manager, eventId);
            const order = event ? await find(orderId) : null;
            if (!order || order.event_id !== event?.id) return failed('not_found');
            return cancel(order, origin);
        }
    };
}

// Null when the order never reached Abacate Pay, which is as unpaid as it
// gets. An upstream failure is its own answer: an order that may have been
// paid is never cancelled on a guess.
async function paymentState(
    abacatePay: AbacatePayGateway,
    order: CancellableOrderRow
): Promise<PaymentState | null | 'unreachable'> {
    if (!order.abacate_checkout_id) return null;
    try {
        return order.payment_method === 'BOLETO'
            ? await abacatePay.getTransparent(order.abacate_checkout_id)
            : await abacatePay.getCheckout(order.abacate_checkout_id);
    } catch {
        return 'unreachable';
    }
}

// Abacate Pay is authoritative that money was collected, so the cancellation
// is refused whether or not this recovery succeeds; a failure is logged and the
// webhook or the reconciler finishes the job.
async function recoverPaid(
    deps: OrderCancellationDeps,
    order: CancellableOrderRow,
    payment: PaymentState,
    origin: string
): Promise<void> {
    try {
        await deps.orderStates.markPaid(order.id, payment);
        await deps.fulfilment.fulfil(order.id, origin);
    } catch (cause) {
        const event = 'paid_order_recovery_failed';
        console.warn(JSON.stringify({ event, orderId: order.id, error: String(cause) }));
    }
}
