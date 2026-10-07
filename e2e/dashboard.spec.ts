import { expect, test } from '@playwright/test';
import {
    ADMIN,
    MEMBER,
    OTHER_ORG_DRAFT,
    PUBLISHED_EVENT,
    PUBLISHED_TICKET_TYPE
} from './support/fixtures';
import { withoutScripts } from './support/html';
import { signIn } from './support/session';

const DASHBOARD = `/events/${PUBLISHED_EVENT.id}/dashboard`;

test('an anonymous visitor is sent to log in and brought back afterwards', async ({ request }) => {
    const response = await request.get(DASHBOARD, { maxRedirects: 0 });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe(
        `/auth/login?next=${encodeURIComponent(DASHBOARD)}`
    );
});

// The dashboard used to fetch its stats from Phoenix after hydration. Assert at
// the HTML level so the figures provably come from the server now.
test('a manager sees revenue, stock and recent orders server-rendered', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get(DASHBOARD)).text();

    const htmlMarkup = withoutScripts(html);

    expect(htmlMarkup).toContain('246,90'); // one paid order of two tickets
    expect(htmlMarkup).toContain(PUBLISHED_TICKET_TYPE.name);
    // The span carries Svelte's scoped class hash, hence the pattern.
    expect(htmlMarkup).toMatch(/3<span class="muted[^"]*">\/10<\/span>/); // reserved / capacity
    expect(htmlMarkup).toContain(MEMBER.email); // recent orders
});

test('the buyers of a ticket type are rendered from the query string', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    await page.goto(`${DASHBOARD}?buyers=ticket:${PUBLISHED_TICKET_TYPE.id}`);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('cell', { name: MEMBER.name })).toBeVisible();
    await expect(dialog.getByRole('cell', { name: MEMBER.taxId })).toBeVisible();
    // Paid (2) plus pending (1) tickets, as the stock card counts them.
    await expect(dialog.getByRole('cell', { name: '3', exact: true })).toBeVisible();
});

// 404 rather than 403 on purpose, as Phoenix's stats endpoint answered: a
// "forbidden" would confirm that another organization's event exists.
test('an event of another organization is 404 for a manager and 200 for an admin', async ({
    browser
}) => {
    const url = `/events/${OTHER_ORG_DRAFT.id}/dashboard`;

    const member = await browser.newContext();
    await signIn(member, MEMBER.token);
    expect((await member.request.get(url)).status()).toBe(404);
    await member.close();

    const admin = await browser.newContext();
    await signIn(admin, ADMIN.token);
    expect((await admin.request.get(url)).status()).toBe(200);
    await admin.close();
});

test('the orders page lists the paid orders of the event with validated counts', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get(`/events/${PUBLISHED_EVENT.id}/orders`)).text();

    const htmlMarkup = withoutScripts(html);

    expect(htmlMarkup).toContain(MEMBER.name);
    expect(htmlMarkup).toContain('1/2'); // one of the two ticket passes was scanned
    expect(htmlMarkup).toContain('246,90');
});
