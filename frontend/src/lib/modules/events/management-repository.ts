import type { Queryable } from '$lib/db/queryable';
import type { BatchInput, EventInput, ExtraInput, SectionInput } from './management-types';
import type {
    EventRow,
    ExtraItemRow,
    ExtraSectionRow,
    TicketBatchRow,
    TicketTypeRow
} from './types';

/** A batch with what its ownership check and product label need. */
export interface OwnedBatchRow extends TicketBatchRow {
    event_id: string;
    ticket_type_name: string;
}

export interface NewEventRow extends EventInput {
    organizationId: string;
    createdById: string;
}

export interface NewBatchRow extends BatchInput {
    ticketTypeId: string;
    sequence: number;
}

/**
 * The writes behind event management. Methods that take `db` run inside a
 * transaction the service opened; the rest use the pool. Every delete is
 * logical except batches, which Phoenix hard-deleted when nothing was sold.
 */
export interface EventManagementRepository {
    insertEvent(db: Queryable, row: NewEventRow): Promise<EventRow>;
    updateEvent(id: string, input: EventInput): Promise<EventRow>;
    softDeleteEventCascade(db: Queryable, eventId: string): Promise<void>;

    insertTicketType(eventId: string, name: string): Promise<TicketTypeRow>;
    findTicketType(id: string): Promise<TicketTypeRow | null>;
    updateTicketTypeName(id: string, name: string): Promise<void>;
    softDeleteTicketType(id: string): Promise<void>;

    nextBatchSequence(ticketTypeId: string): Promise<number>;
    insertBatch(db: Queryable, row: NewBatchRow): Promise<TicketBatchRow>;
    setBatchProduct(db: Queryable, batchId: string, productId: string): Promise<void>;
    findBatch(id: string): Promise<OwnedBatchRow | null>;
    updateBatch(id: string, input: BatchInput): Promise<void>;
    /** Marks a manual close; a closed batch stays as it was. */
    closeBatch(id: string): Promise<void>;
    deleteBatch(id: string): Promise<void>;

    insertExtra(
        db: Queryable,
        eventId: string,
        input: ExtraInput & { sectionId: string }
    ): Promise<ExtraItemRow>;
    setExtraProduct(db: Queryable, extraId: string, productId: string): Promise<void>;
    findExtra(id: string): Promise<ExtraItemRow | null>;
    updateExtra(id: string, input: ExtraInput & { sectionId: string }): Promise<void>;
    softDeleteExtra(id: string): Promise<void>;

    insertSection(
        db: Queryable,
        eventId: string,
        input: SectionInput,
        position: number
    ): Promise<ExtraSectionRow>;
    findSection(id: string): Promise<ExtraSectionRow | null>;
    updateSection(id: string, input: SectionInput): Promise<void>;
    updateSectionPosition(db: Queryable, id: string, position: number): Promise<void>;
    softDeleteSection(id: string): Promise<void>;
    countLiveExtras(sectionId: string): Promise<number>;
    /** The event's first live section, by position; null when it has none. */
    defaultSectionId(eventId: string): Promise<string | null>;
    nextSectionPosition(eventId: string): Promise<number>;
}

const EVENT_COLUMNS = `
    id, organization_id, created_by_id, title, description, tickets_description,
    location, starts_at, ends_at, cover_image_url, status, inserted_at, updated_at`;
const TICKET_TYPE_COLUMNS = 'id, event_id, name, description, sales_start, sales_end';
const BATCH_COLUMNS =
    'id, ticket_type_id, sequence, price_cents, quantity_total, quantity_sold, closed_at';
const EXTRA_COLUMNS = `
    id, event_id, section_id, name, description, price_cents, quantity_total, quantity_sold,
    show_remaining, limit_to_ticket_count`;
const SECTION_COLUMNS = 'id, event_id, title, description, position';
const NOW = "now() at time zone 'utc'";

export function getEventManagementRepository(queryable: Queryable): EventManagementRepository {
    return {
        async insertEvent(db, row) {
            const sql = `
                insert into events (organization_id, created_by_id, title, description, tickets_description,
                                    location, starts_at, cover_image_url, status, inserted_at, updated_at)
                values ($1, $2, $3, $4, $5, $6, $7::timestamptz at time zone 'utc', $8, $9, ${NOW}, ${NOW})
                returning ${EVENT_COLUMNS}`;
            const params = [
                row.organizationId,
                row.createdById,
                row.title,
                row.description,
                row.ticketsDescription,
                row.location,
                row.startsAt,
                row.coverImageUrl,
                row.status
            ];
            return one(await db.query<EventRow>(sql, params), 'insert event');
        },

        async updateEvent(id, input) {
            const sql = `
                update events
                set title = $2, description = $3, tickets_description = $4, location = $5,
                    starts_at = $6::timestamptz at time zone 'utc', cover_image_url = $7, status = $8,
                    updated_at = ${NOW}
                where id = $1 returning ${EVENT_COLUMNS}`;
            const params = [
                id,
                input.title,
                input.description,
                input.ticketsDescription,
                input.location,
                input.startsAt,
                input.coverImageUrl,
                input.status
            ];
            return one(await queryable.query<EventRow>(sql, params), 'update event');
        },

        // Children already deleted keep their own timestamp, as the Phoenix
        // cascade preserved it.
        async softDeleteEventCascade(db, eventId) {
            await db.query(`update events set deleted_at = ${NOW} where id = $1`, [eventId]);
            for (const table of ['ticket_types', 'extra_items', 'extra_item_sections']) {
                await db.query(
                    `update ${table} set deleted_at = ${NOW} where event_id = $1 and deleted_at is null`,
                    [eventId]
                );
            }
        },

        async insertTicketType(eventId, name) {
            const sql = `
                insert into ticket_types (event_id, name, inserted_at) values ($1, $2, ${NOW})
                returning ${TICKET_TYPE_COLUMNS}`;
            return one(
                await queryable.query<TicketTypeRow>(sql, [eventId, name]),
                'insert ticket type'
            );
        },

        async findTicketType(id) {
            const sql = `select ${TICKET_TYPE_COLUMNS} from ticket_types where id = $1 and deleted_at is null`;
            return (await queryable.query<TicketTypeRow>(sql, [id]))[0] ?? null;
        },

        async updateTicketTypeName(id, name) {
            await queryable.query(`update ticket_types set name = $2 where id = $1`, [id, name]);
        },

        async softDeleteTicketType(id) {
            await queryable.query(`update ticket_types set deleted_at = ${NOW} where id = $1`, [
                id
            ]);
        },

        async nextBatchSequence(ticketTypeId) {
            const sql = `select coalesce(max(sequence), 0)::int + 1 as next from ticket_batches where ticket_type_id = $1`;
            return (await queryable.query<{ next: number }>(sql, [ticketTypeId]))[0]?.next ?? 1;
        },

        async insertBatch(db, row) {
            const sql = `
                insert into ticket_batches (ticket_type_id, sequence, price_cents, quantity_total, quantity_sold, inserted_at)
                values ($1, $2, $3, $4, 0, ${NOW}) returning ${BATCH_COLUMNS}`;
            const params = [row.ticketTypeId, row.sequence, row.priceCents, row.quantityTotal];
            return one(await db.query<TicketBatchRow>(sql, params), 'insert batch');
        },

        async setBatchProduct(db, batchId, productId) {
            await db.query(`update ticket_batches set abacate_product_id = $2 where id = $1`, [
                batchId,
                productId
            ]);
        },

        async findBatch(id) {
            const sql = `
                select b.id, b.ticket_type_id, b.sequence, b.price_cents, b.quantity_total, b.quantity_sold,
                       b.closed_at, t.event_id, t.name as ticket_type_name
                from ticket_batches b
                join ticket_types t on t.id = b.ticket_type_id
                join events e on e.id = t.event_id
                where b.id = $1 and t.deleted_at is null and e.deleted_at is null`;
            return (await queryable.query<OwnedBatchRow>(sql, [id]))[0] ?? null;
        },

        async updateBatch(id, input) {
            const sql = `update ticket_batches set price_cents = $2, quantity_total = $3 where id = $1`;
            await queryable.query(sql, [id, input.priceCents, input.quantityTotal]);
        },

        async closeBatch(id) {
            const sql = `update ticket_batches set closed_at = ${NOW}, auto_closed = false where id = $1 and closed_at is null`;
            await queryable.query(sql, [id]);
        },

        async deleteBatch(id) {
            await queryable.query(`delete from ticket_batches where id = $1`, [id]);
        },

        async insertExtra(db, eventId, input) {
            const sql = `
                insert into extra_items (event_id, section_id, name, description, price_cents, quantity_total,
                                         quantity_sold, show_remaining, limit_to_ticket_count, inserted_at)
                values ($1, $2, $3, $4, $5, $6, 0, $7, $8, ${NOW}) returning ${EXTRA_COLUMNS}`;
            const params = [
                eventId,
                input.sectionId,
                input.name,
                input.description,
                input.priceCents,
                input.quantityTotal,
                input.showRemaining,
                input.limitToTicketCount
            ];
            return one(await db.query<ExtraItemRow>(sql, params), 'insert extra');
        },

        async setExtraProduct(db, extraId, productId) {
            await db.query(`update extra_items set abacate_product_id = $2 where id = $1`, [
                extraId,
                productId
            ]);
        },

        async findExtra(id) {
            const sql = `select ${EXTRA_COLUMNS} from extra_items where id = $1 and deleted_at is null`;
            return (await queryable.query<ExtraItemRow>(sql, [id]))[0] ?? null;
        },

        async updateExtra(id, input) {
            const sql = `
                update extra_items
                set section_id = $2, name = $3, description = $4, price_cents = $5, quantity_total = $6,
                    show_remaining = $7, limit_to_ticket_count = $8
                where id = $1`;
            await queryable.query(sql, [
                id,
                input.sectionId,
                input.name,
                input.description,
                input.priceCents,
                input.quantityTotal,
                input.showRemaining,
                input.limitToTicketCount
            ]);
        },

        async softDeleteExtra(id) {
            await queryable.query(`update extra_items set deleted_at = ${NOW} where id = $1`, [id]);
        },

        async insertSection(db, eventId, input, position) {
            const sql = `
                insert into extra_item_sections (event_id, title, description, position, inserted_at)
                values ($1, $2, $3, $4, ${NOW}) returning ${SECTION_COLUMNS}`;
            const params = [eventId, input.title, input.description, position];
            return one(await db.query<ExtraSectionRow>(sql, params), 'insert section');
        },

        async findSection(id) {
            const sql = `select ${SECTION_COLUMNS} from extra_item_sections where id = $1 and deleted_at is null`;
            return (await queryable.query<ExtraSectionRow>(sql, [id]))[0] ?? null;
        },

        async updateSection(id, input) {
            const sql = `update extra_item_sections set title = $2, description = $3 where id = $1`;
            await queryable.query(sql, [id, input.title, input.description]);
        },

        async updateSectionPosition(db, id, position) {
            await db.query(`update extra_item_sections set position = $2 where id = $1`, [
                id,
                position
            ]);
        },

        async softDeleteSection(id) {
            await queryable.query(
                `update extra_item_sections set deleted_at = ${NOW} where id = $1`,
                [id]
            );
        },

        async countLiveExtras(sectionId) {
            const sql = `select count(*)::int as n from extra_items where section_id = $1 and deleted_at is null`;
            return (await queryable.query<{ n: number }>(sql, [sectionId]))[0]?.n ?? 0;
        },

        async defaultSectionId(eventId) {
            const sql = `
                select id from extra_item_sections where event_id = $1 and deleted_at is null
                order by position asc, inserted_at asc limit 1`;
            return (await queryable.query<{ id: string }>(sql, [eventId]))[0]?.id ?? null;
        },

        async nextSectionPosition(eventId) {
            const sql = `select coalesce(max(position), -1)::int + 1 as next from extra_item_sections where event_id = $1 and deleted_at is null`;
            return (await queryable.query<{ next: number }>(sql, [eventId]))[0]?.next ?? 0;
        }
    };
}

function one<Row>(rows: Row[], what: string): Row {
    if (!rows[0]) throw new Error(`${what} returned no row`);
    return rows[0];
}
