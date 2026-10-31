import { canManageEvents } from '$lib/modules/accounts/roles';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { EventRepository } from './repository';
import type { EventRow } from './types';

/**
 * Resolves an event `user` may manage: any live event, for anyone whose role
 * manages events. Phoenix's `fetch_owned_event/2` and `authorize_event/2`
 * collapsed "missing" and "forbidden" into one answer so the response never
 * confirms an event exists; so does this, with null.
 *
 * @example
 * const event = await managedEvents.find(user, params.id);
 * if (!event) error(404, 'event not found');
 */
export interface ManagedEventFinder {
    find(user: SessionUser, eventId: string): Promise<EventRow | null>;
}

export function getManagedEventFinder({ events }: { events: EventRepository }): ManagedEventFinder {
    return {
        find(user, eventId) {
            if (!isUuid(eventId) || !canManageEvents(user.role)) return Promise.resolve(null);
            return events.findEventById(eventId);
        }
    };
}
