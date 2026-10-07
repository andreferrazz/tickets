import { logLoadFailure } from './load-failure';
import type { EventMapper } from '$lib/modules/events/mapper';
import type { EventService } from '$lib/modules/events/service';
import type { EventDto } from '$lib/modules/events/types';
import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface ScanData {
    /** The events `user` may scan: every event of every organization they belong to. */
    events: EventDto[];
    loadFailed: boolean;
}

export interface ScanBff {
    index(user: SessionUser): Promise<ScanData>;
}

export interface ScanBffDeps {
    events: EventService;
    eventMapper: EventMapper;
    organizations: OrganizationService;
}

export function getScanBff(deps: ScanBffDeps): ScanBff {
    return {
        async index(user) {
            try {
                const organizationIds = await deps.organizations.listMemberOrganizationIds(user);
                const rows = await deps.events.listForOrganizations(organizationIds);
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
