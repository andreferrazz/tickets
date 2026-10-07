import { expect, test, type Page } from '@playwright/test';
import { CLOSED_EVENT, DRAFT_ORG, MEMBER, PUBLISHED_EVENT } from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { seedPass } from './support/passes';
import { seedPerson } from './support/people';
import { signIn } from './support/session';
import { queryValue } from './support/sql';

// Passes are seeded on the closed event so the dashboard and order specs,
// which count what the published event sold, never see them.
const SCAN_PAGE = `/events/${CLOSED_EVENT.id}/scan`;

/** Types a pass code into the scanner, as pasting it does when there is no camera. */
async function scan(page: Page, token: string): Promise<void> {
    await page.getByLabel('Código do ingresso').fill(token);
    await page.getByRole('button', { name: 'Validar código' }).click();
}

async function openScanner(page: Page, path = SCAN_PAGE): Promise<void> {
    await page.goto(path);
    await waitForHydration(page);
}

test('a ticket is admitted once and refused the second time', async ({ context, page }) => {
    await signIn(context, MEMBER.token);
    const token = await seedPass({ eventId: CLOSED_EVENT.id });
    await openScanner(page);

    await scan(page, token);
    await expect(page.getByRole('status')).toContainText('Entrada liberada');
    await expect(page.getByRole('status')).toContainText('E2E Pista');
    expect(
        await queryValue<string>('select checked_in_by_user_id from passes where token = $1', [
            token
        ])
    ).toBe(MEMBER.id);

    await page.getByRole('button', { name: 'Validar próximo' }).click();
    await scan(page, token);
    await expect(page.getByRole('status')).toContainText('Ingresso já utilizado');
    await expect(page.getByRole('status')).toContainText('Validado em');
});

test('an extras pass lists what to hand over', async ({ context, page }) => {
    await signIn(context, MEMBER.token);
    const token = await seedPass({
        eventId: CLOSED_EVENT.id,
        extras: [
            { name: 'E2E Camiseta', quantity: 2 },
            { name: 'E2E Caneca', quantity: 1 }
        ]
    });
    await openScanner(page);

    await scan(page, token);

    await expect(page.getByRole('status')).toContainText('Complementos');
    await expect(page.getByRole('listitem').filter({ hasText: '2× E2E Camiseta' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: '1× E2E Caneca' })).toBeVisible();
});

test('a pass of another event and an unknown code are refused, and nothing is admitted', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);
    const elsewhere = await seedPass({ eventId: CLOSED_EVENT.id });
    await openScanner(page, `/events/${PUBLISHED_EVENT.id}/scan`);

    await scan(page, elsewhere);
    await expect(page.getByRole('status')).toContainText('Ingresso de outro evento');
    expect(
        await queryValue<string>('select checked_in_at::text from passes where token = $1', [
            elsewhere
        ])
    ).toBeNull();

    await page.getByRole('button', { name: 'Validar próximo' }).click();
    await scan(page, 'no-such-pass');
    await expect(page.getByRole('status')).toContainText('Ingresso inválido');
});

test('scan-only staff can validate; outsiders and anonymous visitors cannot reach the scanner', async ({
    browser,
    request
}) => {
    const staff = await seedPerson({
        role: 'buyer',
        membership: { organizationId: DRAFT_ORG.id, role: 'staff' }
    });
    const staffContext = await browser.newContext();
    await signIn(staffContext, staff.token);
    const staffPage = await staffContext.newPage();
    await openScanner(staffPage);
    await scan(staffPage, await seedPass({ eventId: CLOSED_EVENT.id }));
    await expect(staffPage.getByRole('status')).toContainText('Entrada liberada');
    await staffContext.close();

    const outsider = await seedPerson({ role: 'buyer' });
    const outsiderContext = await browser.newContext();
    await signIn(outsiderContext, outsider.token);
    // 404, not 403: the page must not confirm the event exists.
    expect((await outsiderContext.request.get(SCAN_PAGE)).status()).toBe(404);
    const posted = await outsiderContext.request.post(`${SCAN_PAGE}?/checkin`, {
        form: { token: 'anything' },
        headers: { 'x-sveltekit-action': 'true' }
    });
    expect(((await posted.json()) as { type: string }).type).toBe('failure');
    await outsiderContext.close();

    const anonymous = await request.get(SCAN_PAGE, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(303);
});
