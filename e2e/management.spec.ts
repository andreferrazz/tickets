import { expect, test } from '@playwright/test';
import {
    ADMIN,
    DRAFT_EVENT,
    LEADER,
    MEMBER,
    ORGANIZATION_NAME,
    PENDING_INVITATION
} from './support/fixtures';
import { withoutScripts } from './support/html';
import { seedPerson } from './support/people';
import { signIn } from './support/session';

const TEAM_PAGE = '/team';

test('a leader and an admin see the team and its pending invitations', async ({ browser }) => {
    for (const token of [LEADER.token, ADMIN.token]) {
        const context = await browser.newContext();
        await signIn(context, token);

        const response = await context.request.get(TEAM_PAGE);
        const htmlMarkup = withoutScripts(await response.text());

        expect(response.status()).toBe(200);
        expect(htmlMarkup).toContain(ORGANIZATION_NAME);
        expect(htmlMarkup).toContain(MEMBER.email);
        expect(htmlMarkup).toContain(PENDING_INVITATION.email);
        await context.close();
    }
});

test('a member is sent home from the team page', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    const response = await page.request.get(TEAM_PAGE, { maxRedirects: 0 });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
});

test('the admin users page lists users for admins and sends others home', async ({ browser }) => {
    const admin = await browser.newContext();
    await signIn(admin, ADMIN.token);
    const html = await (await admin.request.get('/admin/users')).text();
    const htmlMarkup = withoutScripts(html);
    expect(htmlMarkup).toContain(MEMBER.email);
    await admin.close();

    const leader = await browser.newContext();
    await signIn(leader, LEADER.token);
    const response = await leader.request.get('/admin/users', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
    await leader.close();
});

test('the scan landing lists every event for the team and sends a buyer home', async ({
    browser
}) => {
    const member = await browser.newContext();
    await signIn(member, MEMBER.token);
    const html = await (await member.request.get('/scan')).text();
    expect(withoutScripts(html)).toContain(DRAFT_EVENT.title);
    await member.close();

    const buyer = await seedPerson({ role: 'buyer' });
    const theirs = await browser.newContext();
    await signIn(theirs, buyer.token);
    const response = await theirs.request.get('/scan', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
    await theirs.close();
});
