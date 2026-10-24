import type { Queryable } from '$lib/db/queryable';
import type { EventRow } from './types';

export interface EventRepository {
    /** Every event anyone may see: published and closed. */
    listPublicEvents(): Promise<EventRow[]>;

    /** Every live event, drafts included. For those who manage or scan events. */
    listAllEvents(): Promise<EventRow[]>;

    /** `id` if anyone may see it: published or closed. Null otherwise. */
    findPublicEventById(id: string): Promise<EventRow | null>;

    /** `id` whatever its status, drafts included. For those who manage or scan events. */
    findEventById(id: string): Promise<EventRow | null>;
}

export function getEventRepository({ queryable }: { queryable: Queryable }): EventRepository {
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
        }
    };
}

function first(rows: EventRow[]): EventRow | null {
    return rows[0] ?? null;
}

const COLUMNS = `
    id, created_by_id, title, description, tickets_description,
    location, starts_at, ends_at, cover_image_url, status,
    inserted_at, updated_at
`;
