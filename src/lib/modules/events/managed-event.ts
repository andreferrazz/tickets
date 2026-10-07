import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { EventRepository } from './repository';
import type { EventRow } from './types';

/**
 * Resolves an event `user` may manage: any live event for an admin, otherwise
 * one whose organization they lead or participate in. Phoenix's
 * `fetch_owned_event/2` and `authorize_event/2` collapsed "missing" and
 * "forbidden" into one answer so the response never confirms an event exists;
 * so does this, with null.
 *
 * @example
 * const event = await managedEvents.find(user, params.id);
 * if (!event) error(404, 'event not found');
 */
export interface ManagedEventFinder {
    find(user: SessionUser, eventId: string): Promise<EventRow | null>;
}

export interface ManagedEventFinderDeps {
    events: EventRepository;
    organizations: OrganizationService;
}

export function getManagedEventFinder(deps: ManagedEventFinderDeps): ManagedEventFinder {
    return {
        async find(user, eventId) {
            if (!isUuid(eventId)) return null;
            const event = await deps.events.findEventById(eventId);
            if (!event) return null;
            const allowed = await deps.organizations.canManage(user, event.organization_id);
            return allowed ? event : null;
        }
    };
}
