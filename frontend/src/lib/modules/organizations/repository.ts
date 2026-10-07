import type { Queryable } from '$lib/db/queryable';
import type { OrgRole, PixKeyType } from '$lib/types';
import type {
    AddMemberOutcome,
    MemberChangeOutcome,
    MembershipSummaryRow,
    MemberRow,
    OrganizationRow
} from './types';

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

    insert(name: string): Promise<OrganizationRow>;
    rename(id: string, name: string): Promise<void>;
    /** The Pix destination of the organization's payouts; key and type always change together. */
    setPayoutKey(id: string, pixKey: string, pixKeyType: PixKeyType): Promise<void>;
    /** Whether the user behind `email` already belongs to `organizationId`. */
    isEmailMember(email: string, organizationId: string): Promise<boolean>;
    /** Never touches the leader row: that is a transfer, not a role change. */
    setMemberRole(
        organizationId: string,
        userId: string,
        role: 'participant' | 'staff'
    ): Promise<MemberChangeOutcome>;
    removeMember(organizationId: string, userId: string): Promise<MemberChangeOutcome>;
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

        async insert(name) {
            const sql = `
                insert into organizations (name, inserted_at, updated_at)
                values ($1, now() at time zone 'utc', now() at time zone 'utc')
                returning id, name, pix_key, pix_key_type, inserted_at, updated_at`;
            const rows = await queryable.query<OrganizationRow>(sql, [name]);
            if (!rows[0]) throw new Error('insert organization returned no row');
            return rows[0];
        },

        async rename(id, name) {
            const sql = `update organizations set name = $2, updated_at = now() at time zone 'utc' where id = $1`;
            await queryable.query(sql, [id, name]);
        },

        async setPayoutKey(id, pixKey, pixKeyType) {
            const sql = `
                update organizations
                set pix_key = $2, pix_key_type = $3, updated_at = now() at time zone 'utc'
                where id = $1`;
            await queryable.query(sql, [id, pixKey, pixKeyType]);
        },

        async isEmailMember(email, organizationId) {
            const sql = `
                select 1 from organization_memberships m join users u on u.id = m.user_id
                where u.email = $1 and m.organization_id = $2 limit 1`;
            return (await queryable.query(sql, [email, organizationId])).length > 0;
        },

        async setMemberRole(organizationId, userId, role) {
            const current = await memberRole(queryable, organizationId, userId);
            if (current === null) return 'not_found';
            if (current === 'leader') return 'leader';
            const sql = `
                update organization_memberships set role = $3, updated_at = now() at time zone 'utc'
                where organization_id = $1 and user_id = $2`;
            await queryable.query(sql, [organizationId, userId, role]);
            return 'changed';
        },

        async removeMember(organizationId, userId) {
            const current = await memberRole(queryable, organizationId, userId);
            if (current === null) return 'not_found';
            if (current === 'leader') return 'leader';
            await queryable.query(
                `delete from organization_memberships where organization_id = $1 and user_id = $2`,
                [organizationId, userId]
            );
            return 'changed';
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

async function memberRole(
    db: Queryable,
    organizationId: string,
    userId: string
): Promise<OrgRole | null> {
    const sql = `select role from organization_memberships where organization_id = $1 and user_id = $2`;
    return (await db.query<{ role: OrgRole }>(sql, [organizationId, userId]))[0]?.role ?? null;
}

function idsOf(rows: { organization_id: string }[]): string[] {
    return rows.map((row) => row.organization_id);
}
