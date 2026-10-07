import { expect, test, type Page } from '@playwright/test';
import { parse } from 'devalue';
import { latestAuthCode, userColumn } from './support/auth-codes';
import { ADMIN, DRAFT_ORG, MEMBER, PENDING_INVITATION } from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { signIn } from './support/session';
import { execute } from './support/sql';

const VALID_CPF = '390.533.447-05';
const VALID_PHONE = '(11) 99999-9999';

/** Drives the real login form up to the verified session. */
async function logInWithCode(page: Page, email: string): Promise<void> {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page).toHaveURL(/\/auth\/verify\?email=/);

    await page.getByLabel('Código de 6 dígitos').fill(await latestAuthCode(email));
    await page.getByRole('button', { name: 'Verificar' }).click();
}

async function completeProfile(page: Page, cpf: string): Promise<void> {
    await page.getByLabel('Nome completo').fill('Nova Pessoa');
    await page.getByLabel('Celular').fill(VALID_PHONE);
    await page.getByLabel('CPF ou CNPJ').fill(cpf);
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
}

test('a first login creates a buyer, asks for the profile and registers the customer', async ({
    page
}) => {
    const email = 'first-login@e2e.test';

    await logInWithCode(page, email);
    await expect(page).toHaveURL(/\/auth\/profile/);

    await completeProfile(page, VALID_CPF);
    await expect(page).toHaveURL('/');

    expect(await userColumn(email, 'role')).toBe('buyer');
    // The fake Abacate Pay names its customers after the tax id it was given.
    expect(await userColumn(email, 'abacate_customer_id')).toBe('cust_fake_39053344705');
    // The session cookie, not the browser's copy, is what server pages trust.
    expect((await page.request.get('/orders')).status()).toBe(200);
});

test('an invalid tax id is refused before any customer is registered', async ({ page }) => {
    const email = 'bad-cpf@e2e.test';

    await logInWithCode(page, email);
    await completeProfile(page, '111.111.111-11');

    await expect(page.getByText('CPF ou CNPJ inválido.')).toBeVisible();
    expect(await userColumn(email, 'abacate_customer_id')).toBeNull();
});

test('a wrong code is refused', async ({ page }) => {
    await page.goto('/auth/verify?email=nobody%40e2e.test');

    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();

    await expect(page.getByText('invalid or expired code')).toBeVisible();
});

// Logging in with the email a pending invitation names consumes it: the buyer
// becomes a creator with the invited membership, in one transaction.
test('a pending invitation is accepted on first login', async ({ page }) => {
    await logInWithCode(page, PENDING_INVITATION.email);
    await completeProfile(page, VALID_CPF);
    await expect(page).toHaveURL('/');

    expect(await userColumn(PENDING_INVITATION.email, 'role')).toBe('creator');
    const team = await page.request.get(`/organizations/${DRAFT_ORG.id}/invitations`);
    expect(team.status()).toBe(200);
});

test('the next parameter survives the whole flow', async ({ page }) => {
    const email = 'next-param@e2e.test';
    await page.goto('/auth/login?next=%2Forders');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await page.getByLabel('Código de 6 dígitos').fill(await latestAuthCode(email));
    await page.getByRole('button', { name: 'Verificar' }).click();

    await expect(page).toHaveURL(/\/auth\/profile\?next=%2Forders/);
    await completeProfile(page, VALID_CPF);
    await expect(page).toHaveURL('/orders');
});

// Logging out revokes the session it was done with. Minting one just for this
// test keeps the shared member token alive for every other spec in the run.
test('logging out revokes the session', async ({ context, page }) => {
    const token = 'e2e-session-member-logout';
    await execute(
        `insert into sessions (user_id, token, expires_at, inserted_at)
         values ($1, $2, (now() at time zone 'utc') + interval '1 day', now() at time zone 'utc')
         on conflict (token) do nothing`,
        [MEMBER.id, token]
    );
    await signIn(context, token);
    await page.goto('/profile');
    await expect(page.getByText(MEMBER.email)).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL('/');
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
});

test('an admin mints a single-use link that signs in as another user', async ({ browser }) => {
    const admin = await browser.newContext();
    await signIn(admin, ADMIN.token);
    const response = await admin.request.post('/admin/users?/impersonate', {
        form: { userId: MEMBER.id },
        headers: { 'x-sveltekit-action': 'true' }
    });
    const body = (await response.json()) as { type: string; data: string };
    expect(body.type).toBe('success');
    const { token } = parse(body.data) as { token: string };
    await admin.close();
    const link = `/auth/impersonate?token=${token}`;

    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await page.goto(link);
    // Opening the link signs nobody in: that takes the button.
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
    await waitForHydration(page);
    await page.getByRole('button', { name: `Entrar como ${MEMBER.email}` }).click();
    await expect(page).toHaveURL('/');
    const html = await (await page.request.get('/orders')).text();
    expect(html).toContain('E2E Published Show'); // MEMBER's order, so the link signed in as them
    await visitor.close();

    const second = await (await browser.newContext()).newPage();
    await second.goto(link);
    await expect(second.getByText('Não foi possível acessar com este link.')).toBeVisible();
    await second.context().close();
});

// The link used to carry a session token, and any live session token worked:
// anyone could sign a victim into their own account by sending them a link.
test('a session token is not an impersonation link', async ({ page }) => {
    await page.goto(`/auth/impersonate?token=${ADMIN.token}`);

    await expect(page.getByText('Não foi possível acessar com este link.')).toBeVisible();
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
});

test('the next parameter cannot send a visitor to another site', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    // A tab is stripped by browsers, which would turn this into //evil.example.
    const hostile = await page.request.get('/auth/profile?next=/%09/evil.example', {
        maxRedirects: 0
    });
    const honest = await page.request.get('/auth/profile?next=/orders', { maxRedirects: 0 });

    expect(hostile.headers()['location']).toBe('/');
    expect(honest.headers()['location']).toBe('/orders');
});

test('guesses at a login code are cut off', async ({ page }) => {
    const email = 'throttled@e2e.test';
    for (let attempt = 0; attempt < 5; attempt++) {
        await page.request.post('/auth/verify?/verify', {
            form: { email, code: '000000' },
            headers: { 'x-sveltekit-action': 'true' }
        });
    }

    await page.goto(`/auth/verify?email=${encodeURIComponent(email)}`);
    await waitForHydration(page);
    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();

    await expect(page.getByText(/too many attempts/)).toBeVisible();
});
