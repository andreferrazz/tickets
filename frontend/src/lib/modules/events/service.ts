import type { SessionUser } from '$lib/modules/sessions/types';
import type { EventRepository } from './repository';
import type { EventRow } from './types';

export interface EventService {
    /**
     * Events `user` is allowed to see, ordered by start time.
     *
     * Anonymous visitors and buyers see published and closed events. Members see
     * their own organizations' drafts on top of that. Admins see everything.
     */
    listVisible(user: SessionUser | null): Promise<EventRow[]>;

    /**
     * The event `id`, or null when `user` may not see it.
     *
     * "Does not exist" and "you may not see it" are deliberately the same answer:
     * telling them apart would leak the existence of an organization's drafts.
     */
    getVisible(user: SessionUser | null, id: string): Promise<EventRow | null>;
}

export function getEventService(repository: EventRepository): EventService {
    return {
        listVisible(user: SessionUser | null): Promise<EventRow[]> {
            if (!user) {
                return repository.listPublicEvents();
            }

            if (user.role === 'admin') {
                return repository.listAllEvents();
            }

            return repository.listEventsForMember(user.id);
        },

        getVisible(user: SessionUser | null, id: string): Promise<EventRow | null> {
            // Postgres raises on a malformed uuid, and a mistyped URL is a miss,
            // not a failure.
            if (!UUID.test(id)) {
                return Promise.resolve(null);
            }

            if (!user) {
                return repository.findPublicEventById(id);
            }

            if (user.role === 'admin') {
                return repository.findEventById(id);
            }

            return repository.findEventByIdForMember(id, user.id);
        }
    };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
