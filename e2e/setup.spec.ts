import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E_BLANK_DATABASE_URL } from './support/database';
import { postFormAction } from './support/form-action';
import { waitForHydration } from './support/hydration';
import { completeProfile } from './support/profile';
import { uniqueEmail } from './support/unique';

// The steps share one database that starts empty and gains its admin halfway
// through, so they run in order; this is the one spec file that depends on it.
test.describe.configure({ mode: 'serial' });

/** A value from the blank database; the shared `sql` helper reads the seeded one. */
async function blankValue<T>(sql: string, params: unknown[]): Promise<T | null> {
    const client = new pg.Client({ connectionString: E2E_BLANK_DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ value: T }>(`select (${sql}) as value`, params);
        return rows[0]?.value ?? null;
    } finally {
        await client.end();
    }
}

/** The login code in the newest email to `email`, read from this server's own outbox. */
async function latestCodeFrom(page: Page, email: string): Promise<string> {
    const response = await page.request.get(`/e2e-fakes/outbox?to=${encodeURIComponent(email)}`);
    const emails = (await response.json()) as { subject: string }[];
    const code = emails.at(-1)?.subject.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no login code was sent to ${email}`);
    return code;
}

const adminEmail = uniqueEmail('first-admin');

test('with no admin, every page leads to the setup form and the API stays open', async ({
    request
}) => {
    for (const path of ['/', '/auth/login', '/events/new', '/orders']) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(303);
        expect(response.headers()['location'], path).toBe('/setup');
    }
    expect((await request.get('/setup')).status()).toBe(200);
    // Programs, not people: the webhook must not be bounced to a form.
    expect((await request.get('/e2e-fakes/outbox')).status()).toBe(200);
});

test('naming the admin creates the account and hands off to the normal login', async ({ page }) => {
    await page.goto('/setup');
    await waitForHydration(page);
    await page.getByLabel('E-mail do administrador').fill(adminEmail);
    await page.getByRole('button', { name: 'Criar administrador' }).click();

    // Straight to the login form with the address filled in: no second way to sign in.
    await expect(page).toHaveURL(/\/auth\/login\?email=/);
    await expect(page.getByLabel('E-mail')).toHaveValue(adminEmail);
    expect(await blankValue<string>('select role from users where email = $1', [adminEmail])).toBe(
        'admin'
    );

    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page).toHaveURL(/\/auth\/verify\?email=/);
    await page.getByLabel('Código de 6 dígitos').fill(await latestCodeFrom(page, adminEmail));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await completeProfile(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: 'Usuários' })).toBeVisible();
});

test('once an admin exists the form is gone and a second submission is refused', async ({
    request
}) => {
    expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(200);
    expect((await request.get('/setup')).status()).toBe(404);

    const posted = await postFormAction(request, '/setup?/create', {
        email: uniqueEmail('second-admin')
    });
    expect([posted.type, posted.data.error]).toEqual(['failure', 'already_set_up']);
    expect(
        await blankValue<number>(`select count(*)::int from users where role = 'admin'`, [])
    ).toBe(1);
});
