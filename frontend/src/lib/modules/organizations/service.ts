import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { OrganizationRepository } from './repository';
import type { ManagerRole, MemberRow, OrganizationRow } from './types';

export type OrganizationFailure = 'not_found' | 'forbidden' | 'validation';

export type OrganizationResult = { ok: true } | { ok: false; failure: OrganizationFailure };

const NAME_MAX = 255;

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

    /** Leader-only (admins bypass): the post-invite rename and any later one. */
    rename(user: SessionUser, organizationId: string, name: string): Promise<OrganizationResult>;
    /** Managers flip members between participant and staff; the leader row is untouchable. */
    setMemberRole(
        user: SessionUser,
        organizationId: string,
        targetUserId: string,
        role: string
    ): Promise<OrganizationResult>;
    /** Managers remove non-leader members, never themselves. */
    removeMember(
        user: SessionUser,
        organizationId: string,
        targetUserId: string
    ): Promise<OrganizationResult>;
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
        listMemberOrganizationIds: (user) => repository.listMemberOrganizationIds(user.id),

        async rename(user, organizationId, rawName) {
            const name = rawName.trim();
            if (!(await this.findById(organizationId))) return { ok: false, failure: 'not_found' };
            if (!(await this.isLeader(user, organizationId)))
                return { ok: false, failure: 'forbidden' };
            if (name.length === 0 || name.length > NAME_MAX)
                return { ok: false, failure: 'validation' };
            await repository.rename(organizationId, name);
            return { ok: true };
        },

        async setMemberRole(user, organizationId, targetUserId, role) {
            if (!(await this.canManage(user, organizationId)))
                return { ok: false, failure: 'forbidden' };
            if (role !== 'participant' && role !== 'staff')
                return { ok: false, failure: 'forbidden' };
            if (!isUuid(targetUserId)) return { ok: false, failure: 'not_found' };
            return memberOutcome(
                await repository.setMemberRole(organizationId, targetUserId, role)
            );
        },

        async removeMember(user, organizationId, targetUserId) {
            if (!(await this.canManage(user, organizationId)))
                return { ok: false, failure: 'forbidden' };
            if (targetUserId === user.id) return { ok: false, failure: 'forbidden' };
            if (!isUuid(targetUserId)) return { ok: false, failure: 'not_found' };
            return memberOutcome(await repository.removeMember(organizationId, targetUserId));
        }
    };
}

function memberOutcome(outcome: 'changed' | 'not_found' | 'leader'): OrganizationResult {
    if (outcome === 'changed') return { ok: true };
    return { ok: false, failure: outcome === 'leader' ? 'forbidden' : 'not_found' };
}
