import { expect, test, type Page } from '@playwright/test';
import { latestAuthCode, userColumn } from './support/auth-codes';
import { ADMIN, DRAFT_ORG, MEMBER } from './support/fixtures';
import { withoutScripts } from './support/html';
import { waitForHydration } from './support/hydration';
import { seedInvitation, seedPerson, seedSession } from './support/people';
import { completeProfile, fakeCustomerId, VALID_CPF } from './support/profile';
import { signIn } from './support/session';
import { uniqueEmail } from './support/unique';

const DEAD_LINK = 'Não foi possível acessar com este link.';

/** Drives the real login form up to the verified session. */
async function logInWithCode(page: Page, email: string, next?: string): Promise<void> {
    await page.goto(next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login');
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page).toHaveURL(/\/auth\/verify\?email=/);

    await page.getByLabel('Código de 6 dígitos').fill(await latestAuthCode(email));
    await page.getByRole('button', { name: 'Verificar' }).click();
}

test('a first login creates a buyer, asks for the profile and registers the customer', async ({
    page
}) => {
    const email = uniqueEmail('first-login');

    await logInWithCode(page, email);
    await expect(page).toHaveURL(/\/auth\/profile/);

    await completeProfile(page);
    await expect(page).toHaveURL('/');

    expect(await userColumn(email, 'role')).toBe('buyer');
    expect(await userColumn(email, 'abacate_customer_id')).toBe(fakeCustomerId(VALID_CPF));
    // The session cookie, not the browser's copy, is what server pages trust.
    expect((await page.request.get('/orders')).status()).toBe(200);
});

test('an invalid tax id is refused before any customer is registered', async ({ page }) => {
    const email = uniqueEmail('bad-cpf');

    await logInWithCode(page, email);
    await completeProfile(page, '111.111.111-11');

    await expect(page.getByText('CPF ou CNPJ inválido.')).toBeVisible();
    expect(await userColumn(email, 'abacate_customer_id')).toBeNull();
});

test('a wrong code is refused', async ({ page }) => {
    await page.goto(`/auth/verify?email=${encodeURIComponent(uniqueEmail('nobody'))}`);
    await waitForHydration(page);

    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();

    await expect(page.getByText('Código inválido ou expirado.')).toBeVisible();
});

// Logging in with the email a pending invitation names consumes it: the buyer
// becomes a creator with the invited membership, in one transaction.
test('a pending invitation is accepted on first login', async ({ page }) => {
    const email = uniqueEmail('invited');
    await seedInvitation({ email, inviterId: MEMBER.id, organizationId: DRAFT_ORG.id });

    await logInWithCode(page, email);
    await completeProfile(page);
    await expect(page).toHaveURL('/');

    expect(await userColumn(email, 'role')).toBe('creator');
    const team = await page.request.get(`/organizations/${DRAFT_ORG.id}/invitations`);
    expect(team.status()).toBe(200);
});

test('the next parameter survives the whole flow', async ({ page }) => {
    await logInWithCode(page, uniqueEmail('next-param'), '/orders');

    await expect(page).toHaveURL(/\/auth\/profile\?next=%2Forders/);
    await completeProfile(page);
    await expect(page).toHaveURL('/orders');
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
    const email = uniqueEmail('throttled');
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

    await expect(
        page.getByText('Muitas tentativas. Solicite um novo código em alguns minutos.')
    ).toBeVisible();
});

// Logging out revokes the session it was done with, so this signs in with one
// of its own: the seeded member token is shared by every other spec.
test('logging out revokes the session', async ({ context, page }) => {
    await signIn(context, await seedSession(MEMBER.id));
    await page.goto('/profile');
    await waitForHydration(page);
    await expect(page.getByText(MEMBER.email)).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).last().click();

    await expect(page).toHaveURL('/');
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
});

test('an admin copies a single-use link that signs in as another user', async ({ browser }) => {
    const admin = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await signIn(admin, ADMIN.token);
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/users');
    await waitForHydration(adminPage);
    const row = adminPage.locator('.line', { hasText: MEMBER.email });
    await row.getByRole('button', { name: 'Copiar link de acesso' }).click();
    await expect(row.getByRole('button', { name: 'Link copiado!' })).toBeVisible();
    const link = await adminPage.evaluate(() => navigator.clipboard.readText());
    await admin.close();
    expect(link).toContain('/auth/impersonate?token=');

    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await page.goto(link);
    // Opening the link signs nobody in: that takes the button.
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
    await waitForHydration(page);
    await page.getByRole('button', { name: `Entrar como ${MEMBER.email}` }).click();
    await expect(page).toHaveURL('/');
    const orders = withoutScripts(await (await page.request.get('/orders')).text());
    expect(orders).toContain('E2E Published Show'); // MEMBER's order: the link signed in as them
    await visitor.close();

    const second = await (await browser.newContext()).newPage();
    await second.goto(link);
    await expect(second.getByText(DEAD_LINK)).toBeVisible();
    await second.context().close();
});

// The link used to carry a session token, and any live session token worked:
// anyone could sign a victim into their own account by sending them a link.
test('a session token is not an impersonation link', async ({ page }) => {
    await page.goto(`/auth/impersonate?token=${ADMIN.token}`);

    await expect(page.getByText(DEAD_LINK)).toBeVisible();
    expect((await page.request.get('/orders', { maxRedirects: 0 })).status()).toBe(303);
});

// The menu entry used to come from Phoenix after hydration; the layout's own
// load decides it now, and it is re-read when the login lands.
test('scan-only staff get "Validar" in the navigation once signed in; a buyer does not', async ({
    browser
}) => {
    const people = [
        await seedPerson({
            role: 'buyer',
            membership: { organizationId: DRAFT_ORG.id, role: 'staff' }
        }),
        await seedPerson({ role: 'buyer' })
    ];
    const scanLinks: number[] = [];

    for (const person of people) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await logInWithCode(page, person.email);
        await expect(page.getByRole('link', { name: 'Meus pedidos' })).toBeVisible();
        scanLinks.push(await page.getByRole('link', { name: 'Validar', exact: true }).count());
        await context.close();
    }

    expect(scanLinks).toEqual([1, 0]);
});
