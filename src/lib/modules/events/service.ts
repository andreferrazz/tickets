import { canManageEvents, canScan } from '$lib/modules/accounts/roles';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { EventRepository } from './repository';
import type { EventRow } from './types';

export interface EventService {
    /**
     * Events `user` is allowed to see, ordered by start time.
     *
     * Anonymous visitors, buyers and scan-only staff see published and closed
     * events. Members, leaders and admins see the drafts too.
     */
    listVisible(user: SessionUser | null): Promise<EventRow[]>;

    /**
     * The event `id`, or null when `user` may not see it.
     *
     * "Does not exist" and "you may not see it" are deliberately the same answer:
     * telling them apart would leak the existence of a draft.
     */
    getVisible(user: SessionUser | null, id: string): Promise<EventRow | null>;

    /** Every live event, for the scan landing; empty for someone who may not scan. */
    listScannable(user: SessionUser): Promise<EventRow[]>;
}

export function getEventService({ repository }: { repository: EventRepository }): EventService {
    return {
        listVisible(user) {
            if (user && canManageEvents(user.role)) return repository.listAllEvents();
            return repository.listPublicEvents();
        },

        getVisible(user, id) {
            // Postgres raises on a malformed uuid, and a mistyped URL is a miss,
            // not a failure.
            if (!isUuid(id)) return Promise.resolve(null);
            if (user && canManageEvents(user.role)) return repository.findEventById(id);
            return repository.findPublicEventById(id);
        },

        listScannable(user) {
            if (!canScan(user.role)) return Promise.resolve([]);
            return repository.listAllEvents();
        }
    };
}
