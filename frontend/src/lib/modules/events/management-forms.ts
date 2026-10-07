import { parseCentsInput } from '$lib/utils/currency';
import { fromLocalInputValue } from '$lib/utils/datetime';
import type { BatchInput, EventInput, ExtraInput, SectionInput } from './management-types';

/**
 * Reads the edit page's forms. Prices arrive as the user typed them
 * ("50,00"), so they are parsed here, and a start typed without JavaScript
 * arrives in the browser's local format and is read as if it were UTC.
 */
export function parseEventInput(form: FormData): EventInput {
    const status = text(form, 'status');
    return {
        title: text(form, 'title'),
        description: text(form, 'description').trim(),
        ticketsDescription: text(form, 'tickets_description').trim() || null,
        location: text(form, 'location'),
        startsAt: isoFromForm(text(form, 'starts_at')),
        coverImageUrl: text(form, 'cover_image_url') || null,
        status: status === 'published' || status === 'closed' ? status : 'draft'
    };
}

export function parseBatchInput(form: FormData): BatchInput {
    return {
        priceCents: parseCentsInput(text(form, 'price')),
        quantityTotal: Number(text(form, 'quantity_total'))
    };
}

export function parseExtraInput(form: FormData): ExtraInput {
    const quantity = text(form, 'quantity_total');
    return {
        sectionId: text(form, 'section_id') || null,
        name: text(form, 'name'),
        description: text(form, 'description') || null,
        priceCents: parseCentsInput(text(form, 'price')),
        quantityTotal: quantity === '' ? null : Number(quantity),
        showRemaining: form.has('show_remaining'),
        limitToTicketCount: form.has('limit_to_ticket_count')
    };
}

export function parseSectionInput(form: FormData): SectionInput {
    return { title: text(form, 'title'), description: text(form, 'description') || null };
}

export function text(form: FormData, field: string): string {
    const value = form.get(field);
    return typeof value === 'string' ? value : '';
}

function isoFromForm(value: string): string {
    if (!value) return '';
    return /Z|[+-]\d\d:\d\d$/.test(value) ? value : fromLocalInputValue(value);
}
