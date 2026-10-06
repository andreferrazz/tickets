import type { EventOrderService } from '$lib/modules/orders/manager-service';
import type { OrderMapper } from '$lib/modules/orders/mapper';
import type { EventOrderDto } from '$lib/modules/orders/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface EventOrdersData {
    /** Null when the event does not exist or `user` may not manage it. */
    orders: EventOrderDto[] | null;
    loadFailed: boolean;
}

export interface EventOrdersBff {
    index(user: SessionUser, eventId: string): Promise<EventOrdersData>;
}

export function getEventOrdersBff(service: EventOrderService, mapper: OrderMapper): EventOrdersBff {
    eventOrdersBff ??= {
        async index(user, eventId) {
            try {
                const views = await service.listForEvent(user, eventId);
                if (!views) return { orders: null, loadFailed: false };
                return {
                    orders: views.map((view) => mapper.toEventOrderDto(view)),
                    loadFailed: false
                };
            } catch (cause) {
                console.error(
                    JSON.stringify({
                        event: 'event_orders_load_failed',
                        eventId,
                        error: String(cause)
                    })
                );
                return { orders: null, loadFailed: true };
            }
        }
    };
    return eventOrdersBff;
}

let eventOrdersBff: EventOrdersBff | null = null;
