import { expect, test } from '@playwright/test';
import {
    ADMIN,
    DRAFT_ORG,
    MEMBER,
    OTHER_ORG,
    OTHER_ORG_DRAFT,
    OWN_ORG_DRAFT,
    PENDING_INVITATION
} from './support/fixtures';
import { signIn } from './support/session';

const TEAM_PAGE = `/organizations/${DRAFT_ORG.id}/invitations`;

test('a leader sees the members and pending invitations of their organization', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get(TEAM_PAGE)).text();

    expect(html).toContain(DRAFT_ORG.name);
    expect(html).toContain(MEMBER.email);
    expect(html).toContain(PENDING_INVITATION.email);
});

// Admins bypass membership for the page, but the invitation list stays the one
// Phoenix gave them: only invitations they sent themselves.
test('an admin opens an organization they do not belong to', async ({ context, page }) => {
    await signIn(context, ADMIN.token);

    const response = await page.request.get(TEAM_PAGE);
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain(DRAFT_ORG.name);
    expect(html).toContain(MEMBER.email);
    expect(html).not.toContain(PENDING_INVITATION.email);
});

test('someone who does not manage the organization is sent home', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    const response = await page.request.get(`/organizations/${OTHER_ORG.id}/invitations`, {
        maxRedirects: 0
    });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
});

test('the admin users page lists users for admins and sends others home', async ({ browser }) => {
    const admin = await browser.newContext();
    await signIn(admin, ADMIN.token);
    const html = await (await admin.request.get('/admin/users')).text();
    expect(html).toContain(MEMBER.email);
    await admin.close();

    const member = await browser.newContext();
    await signIn(member, MEMBER.token);
    const response = await member.request.get('/admin/users', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
    await member.close();
});

// The admin sent no invitation in the seed, and an invitation sent by someone
// else must not show up on their page.
test('the admin invitations page shows only invitations the admin sent', async ({
    context,
    page
}) => {
    await signIn(context, ADMIN.token);

    const response = await page.request.get('/admin/invitations');

    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(PENDING_INVITATION.email);
});

test('the scan landing lists the events of the organizations the user belongs to', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get('/scan')).text();

    expect(html).toContain(OWN_ORG_DRAFT.title);
    expect(html).not.toContain(OTHER_ORG_DRAFT.title);
});
