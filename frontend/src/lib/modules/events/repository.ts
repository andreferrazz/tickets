import type { Queryable } from '$lib/db/queryable';
import type { EventRepository, EventRow } from './types';

const COLUMNS = `
	id, organization_id, created_by_id, title, description, tickets_description,
	location, starts_at, ends_at, cover_image_url, status,
	seat_selection_enabled, seats_per_table, inserted_at, updated_at
`;

// Deletes are logical everywhere in this schema, so every read filters
// `deleted_at`. Ordering matches Phoenix's `order_by: [asc: e.starts_at]`.
const PUBLIC_EVENTS = `
	select ${COLUMNS} from events
	where deleted_at is null and status in ('published', 'closed')
	order by starts_at asc
`;

const ALL_EVENTS = `
	select ${COLUMNS} from events
	where deleted_at is null
	order by starts_at asc
`;

// Phoenix runs this as two queries (list_organization_ids_for_user/1, then the
// event query). A subquery gets the same rows in one round trip.
const EVENTS_FOR_MEMBER = `
	select ${COLUMNS} from events
	where deleted_at is null
		and (
			status in ('published', 'closed')
			or organization_id in (
				select organization_id from organization_memberships where user_id = $1
			)
		)
	order by starts_at asc
`;

/**
 * Event reads against Postgres. Mirrors the three `Backend.Events.list_events/1`
 * clauses in the Phoenix app; keep the two in step until that one is retired.
 *
 * @example
 * const rows = await eventRepository({ queryable }).listPublicEvents();
 */
export function eventRepository(deps: { queryable: Queryable }): EventRepository {
	const { queryable } = deps;
	return {
		listPublicEvents: () => queryable.query<EventRow>(PUBLIC_EVENTS),
		listAllEvents: () => queryable.query<EventRow>(ALL_EVENTS),
		listEventsForMember: (userId: string) => queryable.query<EventRow>(EVENTS_FOR_MEMBER, [userId])
	};
}
