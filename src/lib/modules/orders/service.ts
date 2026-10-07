import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { OrderRepository } from './repository';
import type { OrderDetail, OrderItemRow, OrderRow, OrderWithItems } from './types';

export interface OrderService {
    /** `user`'s orders, newest first, each with its items. */
    listForBuyer(user: SessionUser): Promise<OrderWithItems[]>;

    /**
     * Order `id` with its items and passes, or null when `user` did not place
     * it. "Not yours" and "does not exist" are the same answer, as in Phoenix's
     * `Orders.get_order/2`: nothing about someone else's order is confirmed.
     */
    getForBuyer(user: SessionUser, id: string): Promise<OrderDetail | null>;
}

export function getOrderService({ repository }: { repository: OrderRepository }): OrderService {
    return {
        async listForBuyer(user) {
            const orders = await repository.listForBuyer(user.id);
            const items = await repository.listItems(orders.map((order) => order.id));
            return attachItems(orders, items);
        },

        async getForBuyer(user, id) {
            if (!isUuid(id)) return null;
            const order = await repository.findForBuyer(id, user.id);
            if (!order) return null;
            const [items, passes] = await Promise.all([
                repository.listItems([order.id]),
                repository.listPasses(order.id)
            ]);
            return { order, items, passes };
        }
    };
}

function attachItems(orders: OrderRow[], items: OrderItemRow[]): OrderWithItems[] {
    const byOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
        byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
    }
    return orders.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
}
