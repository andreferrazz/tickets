import type { OrderStatus } from '$lib/types';
import type { OrderFulfilment } from './fulfilment-service';
import type { OrderStateRepository, SettledPayment } from './order-state-repository';
import type { StockReservation } from './stock-reservation';

export type SettlementOutcome = 'settled' | 'not_found';

/**
 * What a payment notice does to an order, as `mark_paid_by_checkout/2`,
 * `fulfill_paid_order/1` and `mark_refunded_by_checkout/1` did it. Both are
 * safe to repeat, because Abacate Pay redelivers.
 *
 * @example
 * const outcome = await orderSettlement.paid('bill_123', payment, url.origin);
 * if (outcome === 'not_found') return json({ error: 'order not found' }, { status: 404 });
 */
export interface OrderSettlement {
    /** Marks the order of `checkoutId` paid, issues its passes and mails them. */
    paid(checkoutId: string, payment: SettledPayment, origin: string): Promise<SettlementOutcome>;
    /** Marks a paid order refunded, gives its stock back and invalidates its passes. */
    refunded(checkoutId: string): Promise<SettlementOutcome>;
}

export interface OrderSettlementDeps {
    orderStates: OrderStateRepository;
    fulfilment: OrderFulfilment;
    stock: StockReservation;
}

// Money that arrives is honoured whatever we did meanwhile: an order we
// expired after fifteen minutes, or one the buyer cancelled, is paid if
// Abacate Pay says it was. Its stock was released by then and is not taken
// again, exactly as in Phoenix. A refunded order stays refunded: a replayed
// `completed` must not hand the passes back.
const PAYABLE: readonly OrderStatus[] = ['pending', 'expired', 'cancelled'];

export function getOrderSettlement(deps: OrderSettlementDeps): OrderSettlement {
    return {
        async paid(checkoutId, payment, origin) {
            const order = await deps.orderStates.findByCheckout(checkoutId);
            if (!order) return 'not_found';
            const paidNow = await deps.orderStates.markPaid(order.id, payment, PAYABLE);
            // An order already paid may still lack passes if the delivery that
            // paid it died before issuing them; fulfilling again is harmless.
            if (paidNow || order.status === 'paid') await deps.fulfilment.fulfil(order.id, origin);
            return 'settled';
        },

        // The passes go with the money: a pass is validated by its token
        // alone, so a refunded ticket would otherwise still open the door, as it
        // did under Phoenix. Only an order that is paid is refunded, so a
        // redelivery cannot release its stock twice.
        async refunded(checkoutId) {
            const order = await deps.orderStates.findByCheckout(checkoutId);
            if (!order) return 'not_found';
            await deps.stock.release({
                orderId: order.id,
                from: ['paid'],
                to: 'refunded',
                deletePasses: true
            });
            return 'settled';
        }
    };
}
