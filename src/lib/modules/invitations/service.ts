import { canLeadTeam } from '$lib/modules/accounts/roles';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { InvitationRepository } from './repository';
import type { InvitationRow } from './types';

export interface InvitationService {
    /** Every invitation, newest first, for those who run the team; nothing for anyone else. */
    listVisible(user: SessionUser): Promise<InvitationRow[]>;
}

export function getInvitationService({
    invitations
}: {
    invitations: InvitationRepository;
}): InvitationService {
    return {
        listVisible(user) {
            if (!canLeadTeam(user.role)) return Promise.resolve([]);
            return invitations.listAll();
        }
    };
}
