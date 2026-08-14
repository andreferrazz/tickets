import { expect, test, type BrowserContext } from '@playwright/test';
import {
    ADMIN,
    MEMBER,
    MISSING_EVENT_ID,
    OTHER_ORG_DRAFT,
    OWN_ORG_DRAFT,
    PUBLISHED_BATCH,
    PUBLISHED_EVENT,
    PUBLISHED_TICKET_TYPE
} from './support/fixtures';

// Mirrors SESSION_COOKIE in src/lib/modules/sessions/cookie.ts. Duplicated rather
// than imported because that module pulls in $app/environment, which only
// resolves inside Vite.
const SESSION_COOKIE = 'tickets_session';

async function signIn(context: BrowserContext, token: string): Promise<void> {
    await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: 'http://localhost:5273' }
    ]);
}

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

    expect(response.status()).toBe(200);
    expect(html).toContain(PUBLISHED_EVENT.title);
    expect(html).toContain(PUBLISHED_TICKET_TYPE.name);
    expect(html).toContain(PUBLISHED_BATCH.label);
});

test('a draft is 404 for an anonymous visitor', async ({ request }) => {
    const response = await request.get(`/events/${OWN_ORG_DRAFT.id}`);

    expect(response.status()).toBe(404);
    // 404 rather than 403 on purpose: the response must not confirm the draft exists.
    expect(await response.text()).not.toContain(OWN_ORG_DRAFT.title);
});

test('a member opens their own organization draft', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    await page.goto(`/events/${OWN_ORG_DRAFT.id}`);

    await expect(page.getByRole('heading', { name: OWN_ORG_DRAFT.title })).toBeVisible();
});

// page.request rather than the standalone `request` fixture: only the page's
// context carries the session cookie signIn just wrote.
test('a member gets 404 for another organization draft', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    const response = await page.request.get(`/events/${OTHER_ORG_DRAFT.id}`);

    expect(response.status()).toBe(404);
});

test('an admin opens a draft from an organization they do not belong to', async ({
    context,
    page
}) => {
    await signIn(context, ADMIN.token);

    const response = await page.request.get(`/events/${OTHER_ORG_DRAFT.id}`);

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(OTHER_ORG_DRAFT.title);
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
