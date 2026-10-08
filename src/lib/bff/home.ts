import { logLoadFailure } from './load-failure';
import type { EventMapper } from '$lib/modules/events/mapper';
import type { EventService } from '$lib/modules/events/service';
import type { EventDto } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface HomeData {
    events: EventDto[];
    loadFailed: boolean;
    filters: HomeFilters;
}

export interface HomeFilters {
    closed: boolean;
    search: string;
}

export interface HomeBff {
    index(user: SessionUser | null, filters: HomeFilters): Promise<HomeData>;
}

export function getHomeBff({
    service,
    mapper
}: {
    service: EventService;
    mapper: EventMapper;
}): HomeBff {
    return {
        async index(user, filters): Promise<HomeData> {
            try {
                const rows = await service.listVisible(user);
                const events = rows
                    .map(mapper.toDto)
                    .filter(closedFilter(filters.closed))
                    .filter(searchFilter(filters.search));
                return { events, filters, loadFailed: false };
            } catch (cause) {
                logLoadFailure('home_events_load_failed', {}, cause);
                return { events: [], filters, loadFailed: true };
            }
        }
    };
}

function closedFilter(closed: boolean) {
    return (event: EventDto) => closed || event.status !== 'closed';
}

function searchFilter(search: string) {
    return (event: EventDto) => {
        if (!search) {
            return true;
        }

        const title = event.title.toLowerCase();
        const location = (event.location ?? '').toLowerCase();
        const needle = search.toLowerCase();

        return title.includes(needle) || location.includes(needle);
    };
}
