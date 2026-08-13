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

}

export function getEventService(repository: EventRepository): EventService {
	return {

		listVisible(user: SessionUser | null): Promise<EventRow[]> {
			if (!user) {
				return repository.listPublicEvents()
			}

			if (user.role === 'admin') {
				return repository.listAllEvents();
			}

			return repository.listEventsForMember(user.id);
		}
	
	};
}
