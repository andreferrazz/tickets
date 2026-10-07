import type { ManagedEventFinder } from '$lib/modules/events/managed-event';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { OrderRepository } from './repository';
import type { EventOrderView } from './types';

/** The orders of one event, for the people who manage it. */
export interface EventOrderService {
    /** Every order on `eventId`, newest first, or null when `user` may not manage the event. */
    listForEvent(user: SessionUser, eventId: string): Promise<EventOrderView[] | null>;
}

export interface EventOrderServiceDeps {
    orders: OrderRepository;
    managedEvents: ManagedEventFinder;
}

export function getEventOrderService(deps: EventOrderServiceDeps): EventOrderService {
    return {
        async listForEvent(user, eventId) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return null;
            const orders = await deps.orders.listForEvent(event.id);
            const ids = orders.map((order) => order.id);
            const [items, validated] = await Promise.all([
                deps.orders.listItems(ids),
                deps.orders.countValidatedTickets(ids)
            ]);
            const validatedByOrder = new Map(validated.map((row) => [row.order_id, row.validated]));
            return orders.map((order) => ({
                order,
                items: items.filter((item) => item.order_id === order.id),
                validatedCount: validatedByOrder.get(order.id) ?? 0
            }));
        }
    };
}
