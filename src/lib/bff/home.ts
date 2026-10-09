import { logLoadFailure } from './load-failure';
import type { HomeFilters } from '$lib/modules/events/home-filters';
import type { EventMapper } from '$lib/modules/events/mapper';
import type { EventService } from '$lib/modules/events/service';
import type { EventDto } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface HomeData {
    /**
     * Every event the caller may see, closed ones included: the page narrows
     * them with `filterHomeEvents`, so changing a filter costs no request.
     */
    events: EventDto[];
    loadFailed: boolean;
    filters: HomeFilters;
}

export interface HomeBff {
    index(user: SessionUser | null, filters: HomeFilters): Promise<HomeData>;
}

export function getHomeBff(service: EventService, mapper: EventMapper): HomeBff {
    return {
        async index(user, filters): Promise<HomeData> {
            try {
                const rows = await service.listVisible(user);
                return { events: rows.map(mapper.toDto), filters, loadFailed: false };
            } catch (cause) {
                logLoadFailure('home_events_load_failed', {}, cause);
                return { events: [], filters, loadFailed: true };
            }
        }
    };
}
