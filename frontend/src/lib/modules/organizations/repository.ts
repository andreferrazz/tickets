import type { Queryable } from '$lib/db/queryable';
import type { OrgRole } from '$lib/types';
import type { MemberRow, OrganizationRow } from './types';

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
        }
    };
}

function idsOf(rows: { organization_id: string }[]): string[] {
    return rows.map((row) => row.organization_id);
}
