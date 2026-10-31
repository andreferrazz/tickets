import { logLoadFailure } from './load-failure';
import type { EventMapper } from '$lib/modules/events/mapper';
import type { EventService } from '$lib/modules/events/service';
import type { EventDto } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface ScanData {
    events: EventDto[];
    loadFailed: boolean;
}

export interface ScanBff {
    /** The events `user` may scan: every live event, for anyone with a role in the team. */
    index(user: SessionUser): Promise<ScanData>;
}

export interface ScanBffDeps {
    events: EventService;
    eventMapper: EventMapper;
}

export function getScanBff(deps: ScanBffDeps): ScanBff {
    return {
        async index(user) {
            try {
                const rows = await deps.events.listScannable(user);
                return {
                    events: rows.map((row) => deps.eventMapper.toDto(row)),
                    loadFailed: false
                };
            } catch (cause) {
                logLoadFailure('scan_events_load_failed', { userId: user.id }, cause);
                return { events: [], loadFailed: true };
            }
        }
    };
}
