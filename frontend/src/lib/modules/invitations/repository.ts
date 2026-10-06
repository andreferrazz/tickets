import type { Queryable } from '$lib/db/queryable';
import type { InvitationRow } from './types';

export interface InvitationRepository {
    /** Invitations `userId` sent, newest first. */
    listByInviter(userId: string): Promise<InvitationRow[]>;

    /** Invitations `userId` sent or that target one of `organizationIds`, newest first. */
    listForManager(userId: string, organizationIds: readonly string[]): Promise<InvitationRow[]>;
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
        }
    };
}

const COLUMNS = 'id, inviter_id, organization_id, role, email, status, inserted_at';
