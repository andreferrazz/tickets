import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { OrganizationRepository } from './repository';
import type { ManagerRole, MemberRow, OrganizationRow } from './types';

/**
 * Who may do what with an organization, as `Backend.Organizations` ruled it:
 * admins bypass everything, leaders and participants manage, staff only scan.
 */
export interface OrganizationService {
    /** `Backend.Organizations.can_manage?/2` plus the admin bypass. */
    canManage(user: SessionUser, organizationId: string): Promise<boolean>;

    /** Admin or leader: who may withdraw the organization's revenue. */
    isLeader(user: SessionUser, organizationId: string): Promise<boolean>;

    /**
     * The role `user` manages `organizationId` with, or null. Admins act as
     * leader, which is what the organization pages assumed for them.
     */
    managerRoleFor(user: SessionUser, organizationId: string): Promise<ManagerRole | null>;

    findById(organizationId: string): Promise<OrganizationRow | null>;
    listMembers(organizationId: string): Promise<MemberRow[]>;
    listManagedOrganizationIds(user: SessionUser): Promise<string[]>;
    listMemberOrganizationIds(user: SessionUser): Promise<string[]>;
}

export function getOrganizationService(repository: OrganizationRepository): OrganizationService {
    return {
        async canManage(user, organizationId) {
            return (await this.managerRoleFor(user, organizationId)) !== null;
        },

        async isLeader(user, organizationId) {
            if (user.role === 'admin') return true;
            return (await repository.findMemberRole(user.id, organizationId)) === 'leader';
        },

        async managerRoleFor(user, organizationId) {
            if (user.role === 'admin') return 'leader';
            if (!isUuid(organizationId)) return null;
            const role = await repository.findMemberRole(user.id, organizationId);
            return role === 'leader' || role === 'participant' ? role : null;
        },

        findById(organizationId) {
            if (!isUuid(organizationId)) return Promise.resolve(null);
            return repository.findById(organizationId);
        },

        listMembers: (organizationId) => repository.listMembers(organizationId),
        listManagedOrganizationIds: (user) => repository.listManagedOrganizationIds(user.id),
        listMemberOrganizationIds: (user) => repository.listMemberOrganizationIds(user.id)
    };
}
