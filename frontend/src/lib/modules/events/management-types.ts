import type { EventDto } from './types';

export type EditableStatus = 'draft' | 'published' | 'closed';

export interface EventInput {
    title: string;
    description: string;
    ticketsDescription: string | null;
    location: string;
    /** ISO 8601 UTC. */
    startsAt: string;
    coverImageUrl: string | null;
    status: EditableStatus;
}

export interface TicketTypeInput {
    name: string;
}

export interface BatchInput {
    priceCents: number;
    quantityTotal: number;
}

export interface ExtraInput {
    /** Null means the event's first live section, as the Phoenix endpoint defaulted it. */
    sectionId: string | null;
    name: string;
    description: string | null;
    priceCents: number;
    quantityTotal: number | null;
    showRemaining: boolean;
    limitToTicketCount: boolean;
}

export interface SectionInput {
    title: string;
    description: string | null;
}

export type ManagementFailure =
    | 'not_found'
    | 'forbidden'
    | 'organization_id_required'
    | 'validation'
    | 'batch_has_sales'
    | 'section_not_empty'
    | 'section_not_found'
    | 'abacate_unavailable';

export type FieldErrors = Record<string, string[]>;

export type ManagementResult<T> =
    { ok: true; value: T } | { ok: false; failure: ManagementFailure; fieldErrors?: FieldErrors };

export type CreatedEvent = Pick<EventDto, 'id'>;
