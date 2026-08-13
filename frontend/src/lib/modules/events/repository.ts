import type { Queryable } from '$lib/db/queryable';
import type { EventRow } from './types';


export interface EventRepository {
	
    /** Every event anyone may see: published and closed. */
	listPublicEvents(): Promise<EventRow[]>;
	
    /** Every event, drafts included. Admins only. */
	listAllEvents(): Promise<EventRow[]>;
	
    /** Public events plus every event belonging to an org `userId` is a member of. */
	listEventsForMember(userId: string): Promise<EventRow[]>;

}

export function getEventRepository(queryable: Queryable): EventRepository {	
    return {
		
		listPublicEvents() {
			const sql = `
				select ${COLUMNS} 
                from events
				where deleted_at is null and status in ('published', 'closed')
				order by starts_at asc`;
			return queryable.query<EventRow>(sql)
		},
		
		listAllEvents() {
			const sql = `
				select ${COLUMNS} 
                from events
				where deleted_at is null
				order by starts_at asc`;
			return queryable.query<EventRow>(sql)
		},
		
		listEventsForMember(userId: string) {
			const sql = `
				select ${COLUMNS} 
                from events
				where deleted_at is null
					and (
						status in ('published', 'closed')
						or organization_id in (
							select organization_id from organization_memberships where user_id = $1
						)
					)
				order by starts_at asc`;
			return queryable.query<EventRow>(sql, [userId])
		}
	
	};
}

const COLUMNS = `
	id, organization_id, created_by_id, title, description, tickets_description,
	location, starts_at, ends_at, cover_image_url, status,
	seat_selection_enabled, seats_per_table, inserted_at, updated_at
`;
