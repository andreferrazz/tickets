import type { EventService } from "$lib/modules/events/service";
import type { EventDto, EventRow } from "$lib/modules/events/types";
import type { SessionUser } from "$lib/modules/sessions/types";
import { toIso8601Utc, toIso8601UtcOrNull } from "$lib/utils/datetime";

export interface HomeData {
    events: EventDto[];
    loadFailed: boolean;
}

export interface HomeBff {
    index(user: SessionUser): Promise<HomeData>; 
}

export function getHomeBff(service: EventService): HomeBff {
    homeBff ??= {

        async index(user): Promise<HomeData> {
            try {
                const rows = await service.listVisible(user)
                const events = rows.map(toDto)
                return { events, loadFailed: false }
            } catch(cause) {
                console.error(JSON.stringify({ event: 'home_events_load_failed', error: String(cause) }));
                return { events: [], loadFailed: true };
            }
        }

    }

    return homeBff;
}

let homeBff: HomeBff | null = null;

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
