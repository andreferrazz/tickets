import type { Queryable } from '$lib/db/queryable';
import type { InvitationRow } from './types';

export interface InvitationRepository {
    /** Invitations `userId` sent, newest first. */
    listByInviter(userId: string): Promise<InvitationRow[]>;

    /** Invitations `userId` sent or that target one of `organizationIds`, newest first. */
    listForManager(userId: string, organizationIds: readonly string[]): Promise<InvitationRow[]>;

    /** A pending, unexpired invitation for `email`, if any. */
    findPendingByEmail(email: string): Promise<InvitationRow | null>;

    /** Runs inside the caller's transaction, next to the promotion it belongs to. */
    markAccepted(db: Queryable, id: string): Promise<void>;
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
        }
    };
}

const COLUMNS = 'id, inviter_id, organization_id, role, email, status, inserted_at';
