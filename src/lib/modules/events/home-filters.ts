import type { EventDto } from './types';

export interface HomeFilters {
    closed: boolean;
    search: string;
}

/**
 * The home page's event list narrowed to what the visitor asked for. Shared by
 * the server render and the browser so both show the same list: the page gets
 * every visible event once and re-filters here on each toggle or keystroke,
 * instead of asking the server (and the database) again.
 *
 * @example
 * filterHomeEvents(events, { closed: false, search: 'belo' });
 */
export function filterHomeEvents(events: readonly EventDto[], filters: HomeFilters): EventDto[] {
    const needle = filters.search.trim().toLowerCase();
    return events.filter(
        (event) => (filters.closed || event.status !== 'closed') && matchesSearch(event, needle)
    );
}

function matchesSearch(event: EventDto, needle: string): boolean {
    if (!needle) return true;
    const title = event.title.toLowerCase();
    const location = (event.location ?? '').toLowerCase();
    return title.includes(needle) || location.includes(needle);
}

/**
 * The query string that reproduces `filters`, empty when nothing is set, so a
 * filtered view survives a reload and can be shared as a link.
 *
 * @example
 * homeFiltersQuery({ closed: true, search: '' }); // '?closed=1'
 */
export function homeFiltersQuery(filters: HomeFilters): '' | `?${string}` {
    const params = new URLSearchParams();
    const search = filters.search.trim();
    if (search) params.set('search', search);
    if (filters.closed) params.set('closed', '1');
    const query = params.toString();
    return query ? `?${query}` : '';
}

/**
 * Whether an event is over as of `nowMs`: past its end, or past its start when
 * no end was given. The home page marks these so a visitor does not open an
 * old event expecting to attend it.
 *
 * @example
 * hasEventEnded(event, Date.now());
 */
export function hasEventEnded(event: EventDto, nowMs: number): boolean {
    return new Date(event.endsAt ?? event.startsAt).getTime() < nowMs;
}
