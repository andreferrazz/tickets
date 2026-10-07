import pg from 'pg';
import { E2E_DATABASE_URL } from './database';

/**
 * The code the app just emailed to `email`, read from the table it was stored
 * in. The fake mailer keeps mail in memory on the server, out of a spec's
 * reach, but the row is the same thing the email carries.
 */
export async function latestAuthCode(email: string): Promise<string> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ code: string }>(
            `select code from auth_codes where email = $1 order by inserted_at desc limit 1`,
            [email]
        );
        if (!rows[0]) throw new Error(`no auth code stored for ${email}`);
        return rows[0].code;
    } finally {
        await client.end();
    }
}

/** One column of the `users` row for `email`, for asserting what a flow persisted. */
export async function userColumn(email: string, column: string): Promise<string | null> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ value: string | null }>(
            `select ${column}::text as value from users where email = $1`,
            [email]
        );
        return rows[0]?.value ?? null;
    } finally {
        await client.end();
    }
}
