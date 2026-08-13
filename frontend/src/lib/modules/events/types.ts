import type { SessionUser } from '$lib/modules/sessions/types';
import type { Event } from '$lib/types';

/**
 * A row of the `events` table, as Postgres returns it. Column names stay
 * snake_case and timestamps stay `Date` — {@link toEventJson} is what turns this
 * into the wire shape.
 */
export interface EventRow {
	id: string;
	organization_id: string;
	created_by_id: string | null;
	title: string;
	description: string;
	tickets_description: string | null;
	location: string;
	starts_at: Date;
	ends_at: Date | null;
	cover_image_url: string | null;
	status: Event['status'];
	seat_selection_enabled: boolean;
	seats_per_table: number | null;
	inserted_at: Date;
	updated_at: Date;
}

export interface EventRepository {
	/** Every event anyone may see: published and closed. */
	listPublicEvents(): Promise<EventRow[]>;
	/** Every event, drafts included. Admins only. */
	listAllEvents(): Promise<EventRow[]>;
	/** Public events plus every event belonging to an org `userId` is a member of. */
	listEventsForMember(userId: string): Promise<EventRow[]>;
}

export interface EventService {
	/** Events `user` is allowed to see, ordered by start time. */
	listVisible(user: SessionUser | null): Promise<EventRow[]>;
}
