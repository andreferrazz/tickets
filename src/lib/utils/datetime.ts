export const APP_TIMEZONE = 'America/Sao_Paulo';

export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
        timeZone: APP_TIMEZONE,
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

export interface EventDateParts {
    day: string;
    month: string;
    year: string;
    weekday: string;
    time: string;
}

const DATE_PARTS_FORMAT = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});

/**
 * A timestamp split into the pieces an event card lays out separately (a
 * calendar-style day and month, then weekday and time), in the app's timezone.
 * Abbreviations come without pt-BR's trailing dot so they can be styled freely.
 *
 * @example
 * eventDateParts('2026-10-02T02:00:00Z');
 * // { day: '01', month: 'out', year: '2026', weekday: 'qui', time: '23:00' }
 */
export function eventDateParts(iso: string): EventDateParts {
    const found = new Map(
        DATE_PARTS_FORMAT.formatToParts(new Date(iso)).map((part) => [part.type, part.value])
    );
    const piece = (type: Intl.DateTimeFormatPartTypes) => (found.get(type) ?? '').replace('.', '');
    return {
        day: piece('day'),
        month: piece('month'),
        year: piece('year'),
        weekday: piece('weekday'),
        time: `${piece('hour')}:${piece('minute')}`
    };
}

export function toLocalInputValue(iso: string): string {
    const parts = new Date(iso).toLocaleString('sv-SE', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return parts.replace(' ', 'T').slice(0, 16);
}

// São Paulo has no DST since 2019, so a fixed -03:00 offset is correct year-round.
// `Date` only accepts numeric offsets in its constructor, not IANA names.
export function fromLocalInputValue(value: string): string {
    return new Date(`${value}:00-03:00`).toISOString();
}

/**
 * Formats a timestamp the way Phoenix's Jason encoder renders Ecto's
 * `:utc_datetime` — second precision, `Z` suffix, no fractional part. The
 * format was kept byte-identical while both served the same pages, and the
 * pages still parse it.
 *
 * @example
 * toIso8601Utc(new Date('2026-05-13T01:00:17.482Z')); // '2026-05-13T01:00:17Z'
 */
export function toIso8601Utc(value: Date): string {
    if (Number.isNaN(value.getTime())) {
        throw new Error(`expected a valid Date, got an invalid one: ${String(value)}`);
    }
    return `${value.toISOString().slice(0, 19)}Z`;
}

/** Same as {@link toIso8601Utc}, but passes `null` through for nullable columns. */
export function toIso8601UtcOrNull(value: Date | null): string | null {
    return value === null ? null : toIso8601Utc(value);
}
