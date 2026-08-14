import type { Queryable } from '$lib/db/queryable';
import type { EventRow } from './types';

export interface EventRepository {
    /** Every event anyone may see: published and closed. */
    listPublicEvents(): Promise<EventRow[]>;

    /** Every event, drafts included. Admins only. */
    listAllEvents(): Promise<EventRow[]>;

    /** Public events plus every event belonging to an org `userId` is a member of. */
    listEventsForMember(userId: string): Promise<EventRow[]>;

    /** `id` if anyone may see it: published or closed. Null otherwise. */
    findPublicEventById(id: string): Promise<EventRow | null>;

    /** `id` whatever its status, drafts included. Admins only. */
    findEventById(id: string): Promise<EventRow | null>;

    /** `id` if it is public, or if `userId` manages the owning organization. */
    findEventByIdForMember(id: string, userId: string): Promise<EventRow | null>;
}

export function getEventRepository(queryable: Queryable): EventRepository {
    return {
        listPublicEvents() {
            const sql = `
				select ${COLUMNS} 
                from events
				where deleted_at is null and status in ('published', 'closed')
				order by starts_at asc`;
            return queryable.query<EventRow>(sql);
        },

        listAllEvents() {
            const sql = `
				select ${COLUMNS} 
                from events
				where deleted_at is null
				order by starts_at asc`;
            return queryable.query<EventRow>(sql);
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
            return queryable.query<EventRow>(sql, [userId]);
        },

        async findPublicEventById(id: string) {
            const sql = `
				select ${COLUMNS}
                from events
				where deleted_at is null and id = $1 and status in ('published', 'closed')`;
            return first(await queryable.query<EventRow>(sql, [id]));
        },

        async findEventById(id: string) {
            const sql = `
				select ${COLUMNS}
                from events
				where deleted_at is null and id = $1`;
            return first(await queryable.query<EventRow>(sql, [id]));
        },

        // The membership roles mirror Backend.Organizations.can_manage?/2: scan-only
        // `staff` members must not see an organization's drafts.
        async findEventByIdForMember(id: string, userId: string) {
            const sql = `
				select ${COLUMNS}
                from events
				where deleted_at is null
					and id = $1
					and (
						status in ('published', 'closed')
						or organization_id in (
							select organization_id from organization_memberships
							where user_id = $2 and role in ('leader', 'participant')
						)
					)`;
            return first(await queryable.query<EventRow>(sql, [id, userId]));
        }
    };
}

function first(rows: EventRow[]): EventRow | null {
    return rows[0] ?? null;
}

const COLUMNS = `
	id, organization_id, created_by_id, title, description, tickets_description,
	location, starts_at, ends_at, cover_image_url, status,
	inserted_at, updated_at
`;
