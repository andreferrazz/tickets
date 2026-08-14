import type { EventDetailMapper } from '$lib/modules/events/detail-mapper';
import type { EventDetailService } from '$lib/modules/events/detail-service';
import type { EventService } from '$lib/modules/events/service';
import type { EventDetailDto } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface EventsData {
    /** Null when the event does not exist or `user` may not see it. */
    event: EventDetailDto | null;
    loadFailed: boolean;
}

export interface EventsBff {
    show(user: SessionUser | null, id: string): Promise<EventsData>;
}

export function getEventDetailBff(
    service: EventService,
    detailService: EventDetailService,
    mapper: EventDetailMapper
): EventsBff {
    eventDetailBff ??= {
        async show(user, id): Promise<EventsData> {
            try {
                const event = await service.getVisible(user, id);
                if (!event) {
                    return { event: null, loadFailed: false };
                }

                const rows = await detailService.loadRows(event.id);
                return { event: mapper.toDto(event, rows), loadFailed: false };
            } catch (cause) {
                console.error(
                    JSON.stringify({ event: 'event_detail_load_failed', id, error: String(cause) })
                );
                return { event: null, loadFailed: true };
            }
        }
    };

    return eventDetailBff;
}

let eventDetailBff: EventsBff | null = null;
