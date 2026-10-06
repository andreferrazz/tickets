import type { Queryable } from '$lib/db/queryable';
import type { UserRow } from './types';

export interface UserRepository {
    /** Every user, by name then email. Admin listing only. */
    listUsers(): Promise<UserRow[]>;
}

export function getUserRepository(queryable: Queryable): UserRepository {
    return {
        listUsers() {
            const sql = `
                select id, email, role, invited_by, name, cellphone, tax_id, abacate_customer_id, inserted_at
                from users
                order by name asc, email asc`;
            return queryable.query<UserRow>(sql);
        }
    };
}
