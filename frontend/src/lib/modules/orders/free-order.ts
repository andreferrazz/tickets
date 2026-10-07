import type { OrderFulfilment } from './fulfilment-service';
import type { OrderStateRepository } from './order-state-repository';
import type { StockReservation } from './stock-reservation';

/**
 * Completes an order with nothing to charge: marked paid and fulfilled on the
 * spot, with no checkout at Abacate Pay. Free carts and comp tickets both end
 * here, as they did in `Backend.Orders.finalize_order/6`.
 *
 * @example
 * const reserved = await stock.reserve(user.id, event.id, freeLines);
 * if (reserved.ok) await freeOrders.settle(reserved.value, url.origin);
 */
export interface FreeOrderSettlement {
    settle(orderId: string, origin: string): Promise<void>;
}

export interface FreeOrderSettlementDeps {
    orderStates: OrderStateRepository;
    fulfilment: OrderFulfilment;
    stock: StockReservation;
}

export function getFreeOrderSettlement(deps: FreeOrderSettlementDeps): FreeOrderSettlement {
    return {
        async settle(orderId, origin) {
            try {
                await deps.orderStates.markPaid(orderId, {
                    paymentMethod: null,
                    cardInstallments: null
                });
                await deps.fulfilment.fulfil(orderId, origin);
            } catch (cause) {
                // Nobody holds passes for it, so the stock must not stay taken.
                await deps.stock.release({
                    orderId,
                    from: ['pending', 'paid'],
                    to: 'expired',
                    deletePasses: true
                });
                throw cause;
            }
        }
    };
}
