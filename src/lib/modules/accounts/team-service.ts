import type { Queryable } from '$lib/db/queryable';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { UserRepository } from './repository';
import { canLeadTeam, isInvitableRole } from './roles';
import type { UserRow } from './types';

export type TeamFailure = 'forbidden' | 'not_found' | 'invalid_role';

export type TeamResult = { ok: true } | { ok: false; failure: TeamFailure };

/**
 * The team of the one organization: who holds a role, and the changes a
 * leader (or admin) may make to it. Nobody changes their own role, and an
 * admin's role is only ever changed by hand in the database.
 *
 * @example
 * const result = await team.setRole(user, memberId, 'leader');
 * if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
 */
export interface TeamService {
    listTeam(): Promise<UserRow[]>;
    /** Promote or demote between member, leader and staff. */
    setRole(actor: SessionUser, targetUserId: string, role: string): Promise<TeamResult>;
    /** Back to buyer: they keep their account and orders, and lose the team. */
    remove(actor: SessionUser, targetUserId: string): Promise<TeamResult>;
}

export interface TeamServiceDeps {
    queryable: Queryable;
    users: UserRepository;
}

export function getTeamService(deps: TeamServiceDeps): TeamService {
    const changeable = async (actor: SessionUser, targetUserId: string) => {
        if (!canLeadTeam(actor.role) || targetUserId === actor.id) return 'forbidden';
        if (!isUuid(targetUserId)) return 'not_found';
        const target = await deps.users.findById(targetUserId);
        if (!target) return 'not_found';
        return target.role === 'admin' ? 'forbidden' : target;
    };

    return {
        listTeam: () => deps.users.listTeam(),

        async setRole(actor, targetUserId, role) {
            if (!isInvitableRole(role)) return { ok: false, failure: 'invalid_role' };
            const target = await changeable(actor, targetUserId);
            if (typeof target === 'string') return { ok: false, failure: target };
            await deps.users.setRole(deps.queryable, target.id, role);
            return { ok: true };
        },

        async remove(actor, targetUserId) {
            const target = await changeable(actor, targetUserId);
            if (typeof target === 'string') return { ok: false, failure: target };
            await deps.users.setRole(deps.queryable, target.id, 'buyer');
            return { ok: true };
        }
    };
}
