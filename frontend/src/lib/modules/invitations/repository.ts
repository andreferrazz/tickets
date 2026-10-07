import type { Queryable } from '$lib/db/queryable';
import type { InvitationRow, InvitationSecretRow, NewInvitationRow } from './types';

export interface InvitationRepository {
    /** Invitations `userId` sent, newest first. */
    listByInviter(userId: string): Promise<InvitationRow[]>;

    /** Invitations `userId` sent or that target one of `organizationIds`, newest first. */
    listForManager(userId: string, organizationIds: readonly string[]): Promise<InvitationRow[]>;

    /** A pending, unexpired invitation for `email`, if any. */
    findPendingByEmail(email: string): Promise<InvitationRow | null>;

    /** Runs inside the caller's transaction, next to the promotion it belongs to. */
    markAccepted(db: Queryable, id: string): Promise<void>;

    insert(row: NewInvitationRow): Promise<InvitationSecretRow>;

    /** Whatever its status; the service decides what a dead token means. */
    findByToken(token: string): Promise<InvitationSecretRow | null>;
}

export function getInvitationRepository(queryable: Queryable): InvitationRepository {
    return {
        listByInviter(userId) {
            const sql = `select ${COLUMNS} from invitations where inviter_id = $1 order by inserted_at desc`;
            return queryable.query<InvitationRow>(sql, [userId]);
        },

        listForManager(userId, organizationIds) {
            const sql = `
                select ${COLUMNS} from invitations
                where inviter_id = $1 or organization_id = any($2::uuid[])
                order by inserted_at desc`;
            return queryable.query<InvitationRow>(sql, [userId, organizationIds]);
        },

        async findPendingByEmail(email) {
            const sql = `
                select ${COLUMNS} from invitations
                where email = $1 and status = 'pending' and expires_at > (now() at time zone 'utc')
                limit 1`;
            const rows = await queryable.query<InvitationRow>(sql, [email]);
            return rows[0] ?? null;
        },

        async markAccepted(db, id) {
            await db.query(`update invitations set status = 'accepted' where id = $1`, [id]);
        },

        async insert(row) {
            const sql = `
                insert into invitations (inviter_id, organization_id, role, email, status, token, expires_at, inserted_at)
                values ($1, $2, $3, $4, 'pending', $5, (now() at time zone 'utc') + make_interval(hours => $6),
                        now() at time zone 'utc')
                returning ${COLUMNS}, token, expires_at`;
            const params = [
                row.inviterId,
                row.organizationId,
                row.role,
                row.email,
                row.token,
                row.ttlHours
            ];
            const rows = await queryable.query<InvitationSecretRow>(sql, params);
            if (!rows[0]) throw new Error('insert invitation returned no row');
            return rows[0];
        },

        async findByToken(token) {
            const sql = `select ${COLUMNS}, token, expires_at from invitations where token = $1`;
            return (await queryable.query<InvitationSecretRow>(sql, [token]))[0] ?? null;
        }
    };
}

const COLUMNS = 'id, inviter_id, organization_id, role, email, status, inserted_at';
