import { expect, test } from '@playwright/test';
import {
    ADMIN,
    CLOSED_EVENT,
    DRAFT_EVENT,
    MEMBER,
    ORGANIZATION_NAME,
    PUBLISHED_EVENT
} from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { withoutScripts } from './support/html';
import { seedPerson } from './support/people';
import { signIn } from './support/session';

test('an anonymous visitor sees published events and no drafts', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: DRAFT_EVENT.title })).toHaveCount(0);
});

test('the event list is server-rendered, before any JavaScript runs', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();
    const htmlMarkup = withoutScripts(html);

    expect(response.status()).toBe(200);
    expect(htmlMarkup).toContain(PUBLISHED_EVENT.title);
    // One title, the organization's: a second static one in app.html used to win.
    expect(htmlMarkup.match(/<title>/g)).toHaveLength(1);
    expect(htmlMarkup).toContain(`<title>${ORGANIZATION_NAME}</title>`);
    // Drafts must not leak into anonymous HTML even though the page is prerendered
    // on the server, which is where a visibility bug would be invisible in the UI.
    expect(html).not.toContain(DRAFT_EVENT.title);
});

test('a member and an admin see the drafts', async ({ browser }) => {
    for (const token of [MEMBER.token, ADMIN.token]) {
        const context = await browser.newContext();
        await signIn(context, token);
        const page = await context.newPage();

        await page.goto('/');

        await expect(page.getByRole('heading', { name: DRAFT_EVENT.title })).toBeVisible();
        await context.close();
    }
});

// Scan-only staff validate at the door; what is not on sale yet is not theirs to see.
test('a staff member sees no drafts', async ({ browser }) => {
    const staff = await seedPerson({ role: 'staff' });
    const context = await browser.newContext();
    await signIn(context, staff.token);

    const html = await (await context.request.get('/')).text();

    expect(withoutScripts(html)).toContain(PUBLISHED_EVENT.title);
    expect(html).not.toContain(DRAFT_EVENT.title);
    await context.close();
});

// The list is narrowed in the browser: every toggle used to be a navigation
// that re-ran the load against the database, which made the checkbox lag.
test('closed events show and hide at once, without asking the server again', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toHaveCount(0);
    const requestsAfterLoad: string[] = [];
    page.on('request', (sent) => requestsAfterLoad.push(sent.url()));

    await page.getByRole('checkbox').check();

    await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toBeVisible();
    await expect(page).toHaveURL(/closed=1/);

    await page.getByRole('checkbox').uncheck();

    await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toHaveCount(0);
    await expect(page).not.toHaveURL(/closed=1/);
    expect(requestsAfterLoad).toEqual([]);
});

// The filters used to be component state only, which meant the served HTML
// ignored them and the toggle only worked if hydration did. Assert on the
// markup so a regression can't hide behind client-side rendering. Closed
// events are public and now travel in the page's data either way, so only the
// markup, not the raw response, can tell the two views apart.
test('the closed filter is applied to the served markup', async ({ request }) => {
    const withClosed = withoutScripts(await (await request.get('/?closed=1')).text());
    const withoutClosed = withoutScripts(await (await request.get('/')).text());

    expect(withClosed).toContain(CLOSED_EVENT.title);
    expect(withoutClosed).not.toContain(CLOSED_EVENT.title);
});

test('typing in the search box narrows the list as the visitor types', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    await page.getByRole('textbox').fill('Published');

    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();

    await page.getByRole('textbox').fill('no event is called this');

    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toHaveCount(0);
});

// A search with no match must not be a dead end: say what was searched and
// offer the way back.
test('a search with no match explains itself and clears in one click', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    await page.getByRole('textbox').fill('no event is called this');

    await expect(
        page.getByText('Nenhum evento encontrado para “no event is called this”.')
    ).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Limpar busca' }).last().click();

    await expect(page.getByRole('textbox')).toHaveValue('');
    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
});

test('search narrows the rendered list', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('textbox').fill('Published');
    await page.getByRole('textbox').press('Enter');

    await expect(page).toHaveURL(/search=Published/);
    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toHaveCount(0);
});
