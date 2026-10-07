import { logLoadFailure } from './load-failure';
import type { EventDetailMapper } from '$lib/modules/events/detail-mapper';
import type { EventDetailService } from '$lib/modules/events/detail-service';
import type { ManagedEventFinder } from '$lib/modules/events/managed-event';
import type { EventDetailDto } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface EventEditData {
    /** Null when the event does not exist or `user` may not manage it. */
    event: EventDetailDto | null;
    loadFailed: boolean;
}

export interface EventManagementBff {
    /** The event and everything it sells, for its managers only. */
    editPage(user: SessionUser, eventId: string): Promise<EventEditData>;
}

export interface EventManagementBffDeps {
    managedEvents: ManagedEventFinder;
    details: EventDetailService;
    detailMapper: EventDetailMapper;
}

export function getEventManagementBff(deps: EventManagementBffDeps): EventManagementBff {
    return {
        async editPage(user, eventId) {
            try {
                const event = await deps.managedEvents.find(user, eventId);
                if (!event) return { event: null, loadFailed: false };
                const rows = await deps.details.loadRows(event.id);
                return { event: deps.detailMapper.toDto(event, rows), loadFailed: false };
            } catch (cause) {
                logLoadFailure('event_edit_load_failed', { eventId }, cause);
                return { event: null, loadFailed: true };
            }
        }
    };
}
