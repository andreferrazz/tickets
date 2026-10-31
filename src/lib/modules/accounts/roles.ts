import type { Role } from '$lib/types';

/** Roles an invitation may grant; `buyer` is what everyone starts as and `admin` is never invited. */
export type InvitableRole = 'member' | 'leader' | 'staff';

export const ROLES: readonly Role[] = ['buyer', 'staff', 'member', 'leader', 'admin'];
const INVITABLE_ROLES: readonly InvitableRole[] = ['member', 'leader', 'staff'];

// Each role includes everything below it, except that scan-only staff sit
// beside buyers rather than above members: they validate at the door and
// nothing else.
const RANK: Record<Role, number> = { buyer: 0, staff: 1, member: 2, leader: 3, admin: 4 };

/**
 * The permission rules of the one organization this deployment serves, in
 * one place: admins do anything, leaders run the team, members run the
 * events, staff scan.
 *
 * @example
 * if (!canManageEvents(user.role)) return failed('forbidden');
 */
export function canManageEvents(role: Role): boolean {
    return role === 'member' || role === 'leader' || role === 'admin';
}

export function canLeadTeam(role: Role): boolean {
    return role === 'leader' || role === 'admin';
}

export function canScan(role: Role): boolean {
    return role !== 'buyer';
}

export function isRole(value: string): value is Role {
    return (ROLES as readonly string[]).includes(value);
}

export function isInvitableRole(value: string): value is InvitableRole {
    return (INVITABLE_ROLES as readonly string[]).includes(value);
}

/**
 * The higher of two roles: what accepting an invitation leaves a person with,
 * so an invitation never demotes anyone.
 *
 * @example
 * higherRole('leader', 'member'); // 'leader'
 */
export function higherRole(current: Role, offered: Role): Role {
    return RANK[offered] > RANK[current] ? offered : current;
}
