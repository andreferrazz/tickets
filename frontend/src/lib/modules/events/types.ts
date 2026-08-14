/**
 * A row of the `events` table, as Postgres returns it. Column names stay
 * snake_case and timestamps stay `Date` — {@link EventMapper} is what turns this
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
    status: EventDto['status'];
    inserted_at: Date;
    updated_at: Date;
}

export interface EventDto {
    id: string;
    organizationId: string;
    createdById: string | null;
    title: string;
    description: string;
    ticketsDescription: string | null;
    location: string;
    startsAt: string;
    endsAt: string | null;
    coverImageUrl: string | null;
    status: 'draft' | 'published' | 'cancelled' | 'closed';
    createdAt: string;
    updatedAt: string;
}

/** A row of `ticket_types`, minus the columns dropped by the batches migration. */
export interface TicketTypeRow {
    id: string;
    event_id: string;
    name: string;
    description: string | null;
    sales_start: Date | null;
    sales_end: Date | null;
}

/** A row of `ticket_batches`, already scoped to one event by the query. */
export interface TicketBatchRow {
    id: string;
    ticket_type_id: string;
    sequence: number;
    price_cents: number;
    quantity_total: number;
    quantity_sold: number;
    closed_at: Date | null;
}

/** A row of `extra_item_sections`. */
export interface ExtraSectionRow {
    id: string;
    event_id: string;
    title: string;
    description: string | null;
    position: number;
}

/** A row of `extra_items`. `quantity_total` is null when stock is unlimited. */
export interface ExtraItemRow {
    id: string;
    event_id: string;
    section_id: string;
    name: string;
    description: string | null;
    price_cents: number;
    quantity_total: number | null;
    quantity_sold: number;
    show_remaining: boolean;
    limit_to_ticket_count: boolean;
}

export interface TicketBatchDto {
    id: string;
    ticketTypeId: string;
    sequence: number;
    /** Display-only, built by the mapper: the batches table stores no label. */
    label: string;
    priceCents: number;
    quantityTotal: number;
    quantitySold: number;
    closedAt: string | null;
}

export interface TicketTypeDto {
    id: string;
    eventId: string;
    name: string;
    description: string | null;
    salesStart: string | null;
    salesEnd: string | null;
    /** The batch currently on sale: the lowest-sequence batch still open. */
    activeBatch: TicketBatchDto | null;
    batches: TicketBatchDto[];
}

export interface ExtraItemDto {
    id: string;
    eventId: string;
    sectionId: string;
    name: string;
    description: string | null;
    priceCents: number;
    quantityTotal: number | null;
    quantitySold: number;
    showRemaining: boolean;
    limitToTicketCount: boolean;
}

export interface ExtraSectionDto {
    id: string;
    eventId: string;
    title: string;
    description: string | null;
    position: number;
    extras: ExtraItemDto[];
}

/** Everything the event page renders: the event plus what is for sale on it. */
export interface EventDetailDto extends EventDto {
    ticketTypes: TicketTypeDto[];
    extraSections: ExtraSectionDto[];
}

/** The child rows of one event, as the detail repository returns them. */
export interface EventDetailRows {
    ticketTypes: TicketTypeRow[];
    batches: TicketBatchRow[];
    sections: ExtraSectionRow[];
    extras: ExtraItemRow[];
}
