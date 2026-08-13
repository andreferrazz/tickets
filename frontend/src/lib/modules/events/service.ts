import type { SessionUser } from '$lib/modules/sessions/types';
import type { EventRepository, EventRow, EventService } from './types';

/**
 * Event reads, scoped to what the caller is allowed to see.
 *
 * Anonymous visitors and buyers see published and closed events. Members see
 * their own organizations' drafts on top of that. Admins see everything. Mirrors
 * `Backend.Events.list_events/1`, which still serves the /scan page.
 *
 * @example
 * const rows = await eventService({ repository }).listVisible(locals.user);
 */
export function eventService(deps: { repository: EventRepository }): EventService {
	const { repository } = deps;
	return {
		listVisible(user: SessionUser | null): Promise<EventRow[]> {
			if (!user) return repository.listPublicEvents();
			if (user.role === 'admin') return repository.listAllEvents();
			return repository.listEventsForMember(user.id);
		}
	};
}
