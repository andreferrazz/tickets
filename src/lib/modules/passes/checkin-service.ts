import { canScan } from '$lib/modules/accounts/roles';
import type { EventRepository } from '$lib/modules/events/repository';
import type { EventRow } from '$lib/modules/events/types';
import type { SessionUser } from '$lib/modules/sessions/types';
import { toIso8601UtcOrNull } from '$lib/utils/datetime';
import { isUuid } from '$lib/utils/uuid';
import type { PassRepository } from './repository';
import type { CheckInDto, CheckInResult, ScannedPassRow } from './types';

/**
 * Pass validation at the door, as `PassController.validate/2` ran it: anyone
 * with a role in the organization (scan-only staff included) may scan any
 * event, a pass is only good at its own event, and a second scan is answered
 * with the time of the first.
 */
export interface PassCheckInService {
    /** The event, when `user` may scan for it; null otherwise, missing or not. */
    scannableEvent(user: SessionUser, eventId: string): Promise<EventRow | null>;
    checkIn(user: SessionUser, eventId: string, token: string): Promise<CheckInResult>;
}

export interface PassCheckInServiceDeps {
    passes: PassRepository;
    events: EventRepository;
}

export function getPassCheckInService(deps: PassCheckInServiceDeps): PassCheckInService {
    const service: PassCheckInService = {
        scannableEvent(user, eventId) {
            if (!isUuid(eventId) || !canScan(user.role)) return Promise.resolve(null);
            return deps.events.findEventById(eventId);
        },

        async checkIn(user, eventId, token) {
            const event = await service.scannableEvent(user, eventId);
            if (!event) return { ok: false, failure: 'forbidden' };
            const pass = token ? await deps.passes.findByToken(token) : null;
            if (!pass) return { ok: false, failure: 'not_found' };
            if (pass.event_id !== event.id) return { ok: false, failure: 'wrong_event' };
            const admitted = await deps.passes.claimCheckIn(pass.id, user.id);
            return { ok: true, value: await describeScan(deps.passes, pass, admitted) };
        }
    };
    return service;
}

// The time is read back after the claim: what is shown is what is stored,
// whether this scan set it or an earlier one did.
async function describeScan(
    passes: PassRepository,
    pass: ScannedPassRow,
    admitted: boolean
): Promise<CheckInDto> {
    const [checkedInAt, extras] = await Promise.all([
        passes.findCheckedInAt(pass.id),
        pass.kind === 'extra' ? passes.listExtraLines(pass.order_id) : Promise.resolve([])
    ]);
    return {
        status: admitted ? 'checked_in' : 'already_checked_in',
        kind: pass.kind,
        itemName: pass.item_name,
        checkedInAt: toIso8601UtcOrNull(checkedInAt),
        extras
    };
}
