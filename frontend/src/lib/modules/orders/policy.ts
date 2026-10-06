import type { OrderStatus } from '$lib/types';

/**
 * Whether the buyer may cancel this order. Only orders with no payment
 * collected qualify: free orders (paid inline, total 0) and still-pending
 * orders. The server re-confirms pending orders with Abacate before acting.
 *
 * @example
 * canBuyerCancel({ status: 'pending', totalCents: 1000 }); // true
 */
export function canBuyerCancel(order: { status: OrderStatus; totalCents: number }): boolean {
    return order.status === 'pending' || (order.status === 'paid' && order.totalCents === 0);
}
