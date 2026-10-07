import type {
    BatchInput,
    EventInput,
    ExtraInput,
    FieldErrors,
    SectionInput,
    TicketTypeInput
} from './management-types';

// Ecto's wording, as the Phoenix changesets produced it.
const BLANK = "can't be blank";
const NOT_POSITIVE = 'must be greater than 0';
const NEGATIVE = 'must be greater than or equal to 0';
const TITLE_MAX = 255;

/** The validation rules of `Event.changeset/1`: title and start are required. */
export function validateEvent(input: EventInput): FieldErrors {
    const errors: FieldErrors = {};
    if (!input.title.trim()) errors.title = [BLANK];
    if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) errors.startsAt = [BLANK];
    return errors;
}

export function validateTicketType(input: TicketTypeInput): FieldErrors {
    return input.name.trim() ? {} : { name: [BLANK] };
}

/** `TicketBatch.create_changeset/1` and `update_changeset/2`, with the sold floor on update. */
export function validateBatch(input: BatchInput, quantitySold = 0): FieldErrors {
    const errors: FieldErrors = {};
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) errors.priceCents = [NEGATIVE];
    if (!Number.isInteger(input.quantityTotal) || input.quantityTotal <= 0) {
        errors.quantityTotal = [NOT_POSITIVE];
    } else if (input.quantityTotal < quantitySold) {
        errors.quantityTotal = [`cannot be less than quantity_sold (${quantitySold})`];
    }
    return errors;
}

export function validateExtra(input: ExtraInput): FieldErrors {
    const errors: FieldErrors = {};
    if (!input.name.trim()) errors.name = [BLANK];
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) errors.priceCents = [NEGATIVE];
    const quantity = input.quantityTotal;
    // Null means unlimited; anything else must be a whole, non-negative stock.
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
        errors.quantityTotal = [NEGATIVE];
    }
    return errors;
}

export function validateSection(input: SectionInput): FieldErrors {
    const errors: FieldErrors = {};
    if (!input.title.trim()) errors.title = [BLANK];
    else if (input.title.length > TITLE_MAX)
        errors.title = [`should be at most ${TITLE_MAX} character(s)`];
    return errors;
}
