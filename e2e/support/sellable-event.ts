import { randomUUID } from 'node:crypto';
import { DRAFT_ORG, MEMBER } from './fixtures';
import { queryRows } from './sql';

export interface NewSellableEvent {
    ticketPriceCents: number;
    ticketStock: number;
    /** An add-on in the event's one section; `stock: null` is unlimited. */
    extra?: { priceCents: number; stock: number | null; limitToTicketCount?: boolean };
    /** Defaults to MEMBER's organization. */
    organizationId?: string;
}

export interface SellableEvent {
    id: string;
    title: string;
    ticketTypeId: string;
    ticketName: string;
    batchId: string;
    extraId: string | null;
    extraName: string;
}

const NOW = "now() at time zone 'utc'";

/**
 * A published event, of MEMBER's organization unless told otherwise, with one ticket type, one open
 * batch and optionally one extra. Checkout specs sell from their own event, so
 * the stock they take never shows up in what another spec counts.
 *
 * @example
 * const event = await seedSellableEvent({ ticketPriceCents: 0, ticketStock: 5 });
 */
export async function seedSellableEvent(spec: NewSellableEvent): Promise<SellableEvent> {
    const title = `E2E Checkout ${randomUUID().slice(0, 8)}`;
    const id = await insertReturningId(
        `insert into events (title, location, starts_at, status, organization_id, created_by_id,
                             inserted_at, updated_at)
         values ($1, 'Sao Paulo', '2027-09-01 20:00:00', 'published', $2, $3, ${NOW}, ${NOW})`,
        [title, spec.organizationId ?? DRAFT_ORG.id, MEMBER.id]
    );
    const ticket = await seedTicket(id, spec);
    const extraId = spec.extra ? await seedExtra(id, spec.extra) : null;
    return { id, title, ...ticket, extraId, extraName: EXTRA_NAME };
}

const TICKET_NAME = 'E2E Entrada';
const EXTRA_NAME = 'E2E Caneca';

async function seedTicket(
    eventId: string,
    spec: NewSellableEvent
): Promise<Pick<SellableEvent, 'ticketTypeId' | 'ticketName' | 'batchId'>> {
    const ticketTypeId = await insertReturningId(
        `insert into ticket_types (event_id, name, inserted_at) values ($1, $2, ${NOW})`,
        [eventId, TICKET_NAME]
    );
    // Priced rows carry a product, as the edit page gives them; free ones do not.
    const batchId = await insertReturningId(
        `insert into ticket_batches (ticket_type_id, sequence, price_cents, quantity_total,
                                     quantity_sold, abacate_product_id, inserted_at)
         values ($1, 1, $2, $3, 0, $4, ${NOW})`,
        [ticketTypeId, spec.ticketPriceCents, spec.ticketStock, productFor(spec.ticketPriceCents)]
    );
    return { ticketTypeId, ticketName: TICKET_NAME, batchId };
}

async function seedExtra(
    eventId: string,
    extra: NonNullable<NewSellableEvent['extra']>
): Promise<string> {
    const sectionId = await insertReturningId(
        `insert into extra_item_sections (event_id, title, position, inserted_at)
         values ($1, 'Addons', 0, ${NOW})`,
        [eventId]
    );
    return insertReturningId(
        `insert into extra_items (event_id, section_id, name, price_cents, quantity_total,
                                  quantity_sold, limit_to_ticket_count, abacate_product_id, inserted_at)
         values ($1, $2, $3, $4, $5, 0, $6, $7, ${NOW})`,
        [
            eventId,
            sectionId,
            EXTRA_NAME,
            extra.priceCents,
            extra.stock,
            extra.limitToTicketCount ?? false,
            productFor(extra.priceCents)
        ]
    );
}

function productFor(priceCents: number): string | null {
    return priceCents > 0 ? `prod_e2e_${randomUUID().slice(0, 8)}` : null;
}

async function insertReturningId(sql: string, params: unknown[]): Promise<string> {
    const [{ id }] = await queryRows<{ id: string }>(`${sql} returning id`, params);
    return id;
}
