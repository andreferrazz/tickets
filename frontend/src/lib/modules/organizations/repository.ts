import type { Queryable } from '$lib/db/queryable';
import type { OrgRole } from '$lib/types';
import type { AddMemberOutcome, MembershipSummaryRow, MemberRow, OrganizationRow } from './types';

export interface OrganizationRepository {
    findById(id: string): Promise<OrganizationRow | null>;

    /** The role `userId` holds in `organizationId`, or null when not a member. */
    findMemberRole(userId: string, organizationId: string): Promise<OrgRole | null>;

    /** Every member of `organizationId`, by email. */
    listMembers(organizationId: string): Promise<MemberRow[]>;

    /** Ids of every organization `userId` leads or participates in. */
    listManagedOrganizationIds(userId: string): Promise<string[]>;

    /** Ids of every organization `userId` belongs to, staff included. */
    listMemberOrganizationIds(userId: string): Promise<string[]>;

    /** Every membership of `userId` with the organization's name, by name. */
    listMembershipsForUser(userId: string): Promise<MembershipSummaryRow[]>;

    /**
     * Adds `userId` to `organizationId` as `role`, inside the caller's transaction.
     * Re-adding a member or a second leader is reported, not thrown, as
     * `Backend.Organizations.add_member/3` did.
     */
    addMember(
        db: Queryable,
        organizationId: string,
        userId: string,
        role: OrgRole
    ): Promise<AddMemberOutcome>;
}

export function getOrganizationRepository(queryable: Queryable): OrganizationRepository {
    return {
        async findById(id) {
            const sql = `
                select id, name, pix_key, pix_key_type, inserted_at, updated_at
                from organizations where id = $1`;
            const rows = await queryable.query<OrganizationRow>(sql, [id]);
            return rows[0] ?? null;
        },

        async findMemberRole(userId, organizationId) {
            const sql = `
                select role from organization_memberships
                where user_id = $1 and organization_id = $2`;
            const rows = await queryable.query<{ role: OrgRole }>(sql, [userId, organizationId]);
            return rows[0]?.role ?? null;
        },

        listMembers(organizationId) {
            const sql = `
                select u.id as user_id, u.email, m.role
                from organization_memberships m join users u on u.id = m.user_id
                where m.organization_id = $1
                order by u.email asc`;
            return queryable.query<MemberRow>(sql, [organizationId]);
        },

        async listManagedOrganizationIds(userId) {
            const sql = `
                select organization_id from organization_memberships
                where user_id = $1 and role in ('leader', 'participant')`;
            return idsOf(await queryable.query<{ organization_id: string }>(sql, [userId]));
        },

        async listMemberOrganizationIds(userId) {
            const sql = `select organization_id from organization_memberships where user_id = $1`;
            return idsOf(await queryable.query<{ organization_id: string }>(sql, [userId]));
        },

        listMembershipsForUser(userId) {
            const sql = `
                select o.id, o.name, m.role
                from organization_memberships m join organizations o on o.id = m.organization_id
                where m.user_id = $1
                order by o.name asc`;
            return queryable.query<MembershipSummaryRow>(sql, [userId]);
        },

        async addMember(db, organizationId, userId, role) {
            const sql = `
                insert into organization_memberships (organization_id, user_id, role, inserted_at, updated_at)
                values ($1, $2, $3, now() at time zone 'utc', now() at time zone 'utc')`;
            try {
                await db.query(sql, [organizationId, userId, role]);
                return 'added';
            } catch (cause) {
                const outcome = uniqueViolationOutcome(cause);
                if (!outcome) throw cause;
                return outcome;
            }
        }
    };
}

// Postgres unique_violation, told apart by the index that fired: one leader per
// organization, one membership per user and organization.
function uniqueViolationOutcome(cause: unknown): AddMemberOutcome | null {
    const error = cause as { code?: string; constraint?: string };
    if (error.code !== '23505') return null;
    if (error.constraint === 'organization_memberships_one_leader_index') return 'leader_exists';
    return 'already_member';
}

function idsOf(rows: { organization_id: string }[]): string[] {
    return rows.map((row) => row.organization_id);
}
