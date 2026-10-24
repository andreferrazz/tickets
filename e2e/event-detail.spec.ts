import { expect, test } from '@playwright/test';
import {
    ADMIN,
    DRAFT_EVENT,
    MEMBER,
    MISSING_EVENT_ID,
    PUBLISHED_BATCH,
    PUBLISHED_EVENT,
    PUBLISHED_TICKET_TYPE
} from './support/fixtures';
import { withoutScripts } from './support/html';
import { seedPerson } from './support/people';

import { signIn } from './support/session';

test('an anonymous visitor sees a published event', async ({ page }) => {
    await page.goto(`/events/${PUBLISHED_EVENT.id}`);

    await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
    await expect(page.getByText(PUBLISHED_TICKET_TYPE.name)).toBeVisible();
});

// The page used to fetch itself from Phoenix after hydration, so none of this
// existed in the served HTML. Assert at the HTML level so that can't come back.
test('the event is server-rendered, before any JavaScript runs', async ({ request }) => {
    const response = await request.get(`/events/${PUBLISHED_EVENT.id}`);
    const html = await response.text();
    const htmlMarkup = withoutScripts(html);

    expect(response.status()).toBe(200);
    expect(htmlMarkup).toContain(PUBLISHED_EVENT.title);
    expect(htmlMarkup).toContain(PUBLISHED_TICKET_TYPE.name);
    expect(htmlMarkup).toContain(PUBLISHED_BATCH.label);
});

test('a draft is 404 for an anonymous visitor', async ({ request }) => {
    const response = await request.get(`/events/${DRAFT_EVENT.id}`);

    expect(response.status()).toBe(404);
    // 404 rather than 403 on purpose: the response must not confirm the draft exists.
    expect(await response.text()).not.toContain(DRAFT_EVENT.title);
});

test('a member opens a draft', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    await page.goto(`/events/${DRAFT_EVENT.id}`);

    await expect(page.getByRole('heading', { name: DRAFT_EVENT.title })).toBeVisible();
});

// Scan-only staff are on the team, but drafts are not theirs to see. The
// context's request carries the session cookie signIn just wrote.
test('a staff member gets 404 for a draft', async ({ browser }) => {
    const staff = await seedPerson({ role: 'staff' });
    const context = await browser.newContext();
    await signIn(context, staff.token);

    const response = await context.request.get(`/events/${DRAFT_EVENT.id}`);

    expect(response.status()).toBe(404);
    await context.close();
});

test('an admin opens a draft', async ({ context, page }) => {
    await signIn(context, ADMIN.token);

    const response = await page.request.get(`/events/${DRAFT_EVENT.id}`);

    expect(response.status()).toBe(200);
    expect(withoutScripts(await response.text())).toContain(DRAFT_EVENT.title);
});

test('an event that does not exist is 404', async ({ request }) => {
    const response = await request.get(`/events/${MISSING_EVENT_ID}`);

    expect(response.status()).toBe(404);
});

// A mistyped URL is a miss, not a crash: the id reaches a uuid column, and
// Postgres raises on a malformed one.
test('a malformed event id is 404', async ({ request }) => {
    const response = await request.get('/events/not-a-uuid');

    expect(response.status()).toBe(404);
});

// These links used to appear after hydration, once the browser had asked
// Phoenix for the visitor's role. The server decides now.
test('the dashboard and edit links are served to a manager and to nobody else', async ({
    browser,
    request
}) => {
    const path = `/events/${PUBLISHED_EVENT.id}`;
    // The server writes the href relative to the page it is on.
    const dashboardLink = new RegExp(`href="[^"]*${path}/dashboard"`);
    const staff = await seedPerson({ role: 'staff' });
    const served: Record<string, boolean> = {};

    for (const [who, token] of Object.entries({
        manager: MEMBER.token,
        admin: ADMIN.token,
        staff: staff.token
    })) {
        const context = await browser.newContext();
        await signIn(context, token);
        served[who] = dashboardLink.test(await (await context.request.get(path)).text());
        await context.close();
    }
    served.anonymous = dashboardLink.test(await (await request.get(path)).text());

    expect(served).toEqual({ manager: true, admin: true, staff: false, anonymous: false });
});
