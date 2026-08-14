import type { Queryable } from '$lib/db/queryable';
import type { ExtraItemRow, ExtraSectionRow, TicketBatchRow, TicketTypeRow } from './types';

/**
 * The child tables of one event: what it sells. Kept apart from
 * {@link EventRepository}, which owns the `events` table itself.
 *
 * Every ordering and soft-delete filter here mirrors `Backend.Events.get_event/1`,
 * because the same event is still served by Phoenix to the pages that have not
 * been migrated yet.
 *
 * @example
 * const rows = await detailRepository.listTicketTypes(event.id);
 */
export interface EventDetailRepository {
    listTicketTypes(eventId: string): Promise<TicketTypeRow[]>;

    /** Every batch of every live ticket type of `eventId`, in sequence order. */
    listTicketBatches(eventId: string): Promise<TicketBatchRow[]>;

    listExtraSections(eventId: string): Promise<ExtraSectionRow[]>;

    listExtraItems(eventId: string): Promise<ExtraItemRow[]>;
}

export function getEventDetailRepository(queryable: Queryable): EventDetailRepository {
    return {
        listTicketTypes(eventId: string) {
            const sql = `
                select id, event_id, name, description, sales_start, sales_end
                from ticket_types
                where event_id = $1 and deleted_at is null
                order by inserted_at asc`;
            return queryable.query<TicketTypeRow>(sql, [eventId]);
        },

        listTicketBatches(eventId: string) {
            const sql = `
                select b.id, b.ticket_type_id, b.sequence, b.price_cents,
                       b.quantity_total, b.quantity_sold, b.closed_at
                from ticket_batches b
                join ticket_types t on t.id = b.ticket_type_id
                where t.event_id = $1 and t.deleted_at is null
                order by b.sequence asc`;
            return queryable.query<TicketBatchRow>(sql, [eventId]);
        },

        listExtraSections(eventId: string) {
            const sql = `
                select id, event_id, title, description, position
                from extra_item_sections
                where event_id = $1 and deleted_at is null
                order by position asc, inserted_at asc`;
            return queryable.query<ExtraSectionRow>(sql, [eventId]);
        },

        listExtraItems(eventId: string) {
            const sql = `
                select id, event_id, section_id, name, description, price_cents,
                       quantity_total, quantity_sold, show_remaining, limit_to_ticket_count
                from extra_items
                where event_id = $1 and deleted_at is null
                order by inserted_at asc`;
            return queryable.query<ExtraItemRow>(sql, [eventId]);
        }
    };
}
