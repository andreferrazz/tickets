import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { InvitationRepository } from './repository';
import type { InvitationRow } from './types';

export interface InvitationService {
    /**
     * The invitations `user` may see, newest first: the ones they sent, plus
     * every invitation into an organization they manage. Admins see only their
     * own, as `Backend.Invitations.list_invitations/1` had it.
     */
    listVisible(user: SessionUser): Promise<InvitationRow[]>;
}

export interface InvitationServiceDeps {
    invitations: InvitationRepository;
    organizations: OrganizationService;
}

export function getInvitationService(deps: InvitationServiceDeps): InvitationService {
    return {
        async listVisible(user) {
            if (user.role === 'admin') return deps.invitations.listByInviter(user.id);
            const managed = await deps.organizations.listManagedOrganizationIds(user);
            return deps.invitations.listForManager(user.id, managed);
        }
    };
}
