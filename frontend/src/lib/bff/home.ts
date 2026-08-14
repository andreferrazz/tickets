import type { EventService } from '$lib/modules/events/service';
import type { EventDto, EventRow } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';
import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/utils/datetime';

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

export function getHomeBff(service: EventService): HomeBff {
    homeBff ??= {
        async index(user, filters): Promise<HomeData> {
            try {
                const rows = await service.listVisible(user);
                const events = rows
                    .map(toDto)
                    .filter(closedFilter(filters.closed))
                    .filter(searchFilter(filters.search));
                return { events, filters, loadFailed: false };
            } catch (cause) {
                console.error(
                    JSON.stringify({ event: 'home_events_load_failed', error: String(cause) })
                );
                return { events: [], filters, loadFailed: true };
            }
        }
    };

    return homeBff;
}

let homeBff: HomeBff | null = null;

function closedFilter(closed: boolean) {
    return (event: EventDto) => closed || event.status !== 'closed';
}

function searchFilter(search: string) {
    return (event: EventDto) => {
        if (!search) {
            return true;
        }

        const title = event.title.toLowerCase();
        const location = event.location.toLowerCase();
        const needle = search.toLowerCase();

        return title.includes(needle) || location.includes(needle);
    };
}

function toDto(row: EventRow): EventDto {
    return {
        id: row.id,
        organizationId: row.organization_id,
        createdById: row.created_by_id,
        title: row.title,
        description: row.description,
        ticketsDescription: row.tickets_description,
        location: row.location,
        startsAt: toIso8601Utc(row.starts_at),
        endsAt: toIso8601UtcOrNull(row.ends_at),
        coverImageUrl: row.cover_image_url,
        status: row.status,
        seatSelectionEnabled: row.seat_selection_enabled,
        seatsPerTable: row.seats_per_table,
        createdAt: toIso8601Utc(row.inserted_at),
        updatedAt: toIso8601Utc(row.updated_at)
    };
}
