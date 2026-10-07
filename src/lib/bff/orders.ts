import { logLoadFailure } from './load-failure';
import type { OrderMapper } from '$lib/modules/orders/mapper';
import type { OrderService } from '$lib/modules/orders/service';
import type { OrderDto, PassDto } from '$lib/modules/orders/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface OrdersData {
    orders: OrderDto[];
    loadFailed: boolean;
}

export interface OrderData {
    /** Null when the order does not exist or `user` did not place it. */
    order: OrderDto | null;
    passes: PassDto[];
    loadFailed: boolean;
}

export interface OrdersBff {
    index(user: SessionUser): Promise<OrdersData>;
    show(user: SessionUser, id: string): Promise<OrderData>;
}

export function getOrdersBff(service: OrderService, mapper: OrderMapper): OrdersBff {
    return {
        async index(user) {
            try {
                const orders = await service.listForBuyer(user);
                return {
                    orders: orders.map(({ order, items }) => mapper.toOrderDto(order, items)),
                    loadFailed: false
                };
            } catch (cause) {
                logLoadFailure('orders_list_load_failed', { userId: user.id }, cause);
                return { orders: [], loadFailed: true };
            }
        },

        async show(user, id) {
            try {
                const detail = await service.getForBuyer(user, id);
                if (!detail) return { order: null, passes: [], loadFailed: false };
                const passes = await Promise.all(
                    detail.passes.map((pass) => mapper.toPassDto(pass))
                );
                return {
                    order: mapper.toOrderDto(detail.order, detail.items),
                    passes,
                    loadFailed: false
                };
            } catch (cause) {
                logLoadFailure('order_detail_load_failed', { userId: user.id, id }, cause);
                return { order: null, passes: [], loadFailed: true };
            }
        }
    };
}
