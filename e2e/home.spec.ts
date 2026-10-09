import { expect, test } from '@playwright/test';
import {
    ADMIN,
    CLOSED_EVENT,
    MEMBER,
    OTHER_ORG_DRAFT,
    OWN_ORG_DRAFT,
    PUBLISHED_EVENT
} from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { withoutScripts } from './support/html';

import { signIn } from './support/session';

test('an anonymous visitor sees published events and no drafts', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: OWN_ORG_DRAFT.title })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: OTHER_ORG_DRAFT.title })).toHaveCount(0);
});

test('the event list is server-rendered, before any JavaScript runs', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();
    const htmlMarkup = withoutScripts(html);

    expect(response.status()).toBe(200);
    expect(htmlMarkup).toContain(PUBLISHED_EVENT.title);
    // Drafts must not leak into anonymous HTML even though the page is prerendered
    // on the server, which is where a visibility bug would be invisible in the UI.
    expect(html).not.toContain(OWN_ORG_DRAFT.title);
});

test('a member sees their own organization drafts but not another org', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: OWN_ORG_DRAFT.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: OTHER_ORG_DRAFT.title })).toHaveCount(0);
});

test('an admin sees drafts from an organization they do not belong to', async ({
    context,
    page
}) => {
    await signIn(context, ADMIN.token);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: OTHER_ORG_DRAFT.title })).toBeVisible();
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
