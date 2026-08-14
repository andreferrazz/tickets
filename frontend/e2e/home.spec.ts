import { expect, test, type BrowserContext } from '@playwright/test';
import {
	ADMIN,
	CLOSED_EVENT,
	MEMBER,
	OTHER_ORG_DRAFT,
	OWN_ORG_DRAFT,
	PUBLISHED_EVENT
} from './support/fixtures';

// Mirrors SESSION_COOKIE in src/lib/modules/sessions/cookie.ts. Duplicated rather
// than imported because that module pulls in $app/environment, which only
// resolves inside Vite.
const SESSION_COOKIE = 'tickets_session';

async function signIn(context: BrowserContext, token: string): Promise<void> {
	await context.addCookies([{ name: SESSION_COOKIE, value: token, url: 'http://localhost:5273' }]);
}

test('an anonymous visitor sees published events and no drafts', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
	await expect(page.getByRole('heading', { name: OWN_ORG_DRAFT.title })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: OTHER_ORG_DRAFT.title })).toHaveCount(0);
});

test('the event list is server-rendered, before any JavaScript runs', async ({ request }) => {
	const response = await request.get('/');
	const html = await response.text();

	expect(response.status()).toBe(200);
	expect(html).toContain(PUBLISHED_EVENT.title);
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

// The form has no submit button, so ticking the box only submits once the page
// has hydrated. Waiting for the network to settle asserts that path instead of
// racing it.
test('closed events stay hidden until the visitor asks for them', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toHaveCount(0);

	await page.getByRole('checkbox').check();

	await expect(page).toHaveURL(/closed=1/);
	await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toBeVisible();
});

// The filters used to be component state, which meant the served HTML ignored
// them and the toggle only worked if hydration did. Assert at the HTML level so
// a regression can't hide behind client-side rendering.
test('the closed filter is applied server-side', async ({ request }) => {
	const withClosed = await (await request.get('/?closed=1')).text();
	const withoutClosed = await (await request.get('/')).text();

	expect(withClosed).toContain(CLOSED_EVENT.title);
	expect(withoutClosed).not.toContain(CLOSED_EVENT.title);
});

test('search narrows the rendered list', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('textbox').fill('Published');
	await page.getByRole('textbox').press('Enter');

	await expect(page).toHaveURL(/search=Published/);
	await expect(page.getByRole('heading', { name: PUBLISHED_EVENT.title })).toBeVisible();
	await expect(page.getByRole('heading', { name: CLOSED_EVENT.title })).toHaveCount(0);
});
