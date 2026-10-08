import type { Queryable } from '$lib/db/queryable';
import type { ProfileInput } from './profile-validation';
import type { UserRow } from './types';

export interface UserRepository {
    /** Every user, by name then email. Admin listing only. */
    listUsers(): Promise<UserRow[]>;
    findById(id: string): Promise<UserRow | null>;
    /** `email` must already be normalized (trimmed, lower-case). */
    findByEmail(email: string, db?: Queryable): Promise<UserRow | null>;
    /** The minimal account a first login creates. */
    insertBuyer(email: string, db?: Queryable): Promise<UserRow>;
    /** Buyer to creator on an accepted invitation; runs inside the caller's transaction. */
    promoteToCreator(db: Queryable, userId: string, invitedBy: string): Promise<UserRow>;
    /** Name, cellphone, tax id and the Abacate customer id in one update. */
    completeProfile(userId: string, profile: ProfileInput, customerId: string): Promise<UserRow>;
}

const COLUMNS =
    'id, email, role, invited_by, name, cellphone, tax_id, abacate_customer_id, inserted_at';

export function getUserRepository({ queryable }: { queryable: Queryable }): UserRepository {
    return {
        listUsers() {
            const sql = `select ${COLUMNS} from users order by name asc, email asc`;
            return queryable.query<UserRow>(sql);
        },

        async findById(id) {
            const rows = await queryable.query<UserRow>(
                `select ${COLUMNS} from users where id = $1`,
                [id]
            );
            return rows[0] ?? null;
        },

        async findByEmail(email, db = queryable) {
            const rows = await db.query<UserRow>(`select ${COLUMNS} from users where email = $1`, [
                email
            ]);
            return rows[0] ?? null;
        },

        async insertBuyer(email, db = queryable) {
            const sql = `
                insert into users (email, role, inserted_at, updated_at)
                values ($1, 'buyer', now() at time zone 'utc', now() at time zone 'utc')
                returning ${COLUMNS}`;
            return firstRow(await db.query<UserRow>(sql, [email]), 'insert user');
        },

        async promoteToCreator(db, userId, invitedBy) {
            const sql = `
                update users set role = 'creator', invited_by = $2, updated_at = now() at time zone 'utc'
                where id = $1 returning ${COLUMNS}`;
            return firstRow(await db.query<UserRow>(sql, [userId, invitedBy]), 'promote user');
        },

        async completeProfile(userId, profile, customerId) {
            const sql = `
                update users
                set name = $2, cellphone = $3, tax_id = $4, abacate_customer_id = $5,
                    updated_at = now() at time zone 'utc'
                where id = $1 returning ${COLUMNS}`;
            const params = [userId, profile.name, profile.cellphone, profile.taxId, customerId];
            return firstRow(await queryable.query<UserRow>(sql, params), 'complete profile');
        }
    };
}

function firstRow(rows: UserRow[], what: string): UserRow {
    if (!rows[0]) throw new Error(`${what} returned no row`);
    return rows[0];
}
