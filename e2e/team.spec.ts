import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E_BASE_URL } from './support/base-url';
import { ADMIN, LEADER, MEMBER } from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { latestEmail } from './support/outbox';
import { seedInvitation, seedPerson } from './support/people';
import { signIn } from './support/session';
import { queryValue } from './support/sql';
import { uniqueEmail } from './support/unique';

const TEAM_PAGE = '/team';

/** The accept link in the invitation email sent to `email`, as a path on this site. */
async function inviteLink(email: string): Promise<string> {
    const { text } = await latestEmail(email);
    const link = text.match(/https?:\/\/\S+\/invite\/\S+/)?.[0];
    if (!link) throw new Error(`no invitation link in the email to ${email}:\n${text}`);
    // The link is built from the request's origin; a wrong one would send
    // invitees to another host.
    expect(link.startsWith(`${E2E_BASE_URL}/invite/`)).toBe(true);
    return link.slice(E2E_BASE_URL.length);
}

async function sendInvitation(page: Page, email: string, role?: string): Promise<void> {
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill(email);
    if (role) await page.locator('form[action="?/invite"] select').selectOption(role);
    await page.getByRole('button', { name: 'Enviar convite' }).click();
}

/** Opens the link as a fresh visitor, accepts, and waits for the page to move on. */
async function acceptAsNewVisitor(browser: Browser, link: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(page).not.toHaveURL(/\/invite\//);
    return page;
}

function invitationStatus(email: string): Promise<string | null> {
    return queryValue<string>('select status from invitations where email = $1', [email]);
}

function roleOf(email: string): Promise<string | null> {
    return queryValue<string>('select role from users where email = $1', [email]);
}

test('a leader invites a member, who joins by opening the link once', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, LEADER.token);
    const email = uniqueEmail('new-member');

    await page.goto(TEAM_PAGE);
    await sendInvitation(page, email);
    await expect(page.getByText(email)).toBeVisible();

    const link = await inviteLink(email);
    // A mail scanner or link preview fetching the link must not use it up.
    await page.request.get(link);
    expect(await invitationStatus(email)).toBe('pending');

    const visitor = await acceptAsNewVisitor(browser, link);
    // A brand-new buyer has no profile yet, so the profile step comes first.
    await expect(visitor).toHaveURL(/\/auth\/profile/);
    expect(await roleOf(email)).toBe('member');
    expect(await invitationStatus(email)).toBe('accepted');

    await visitor.goto(link);
    await expect(visitor.getByText('Este convite já foi utilizado.')).toBeVisible();
    await visitor.context().close();
});

test('a second invitation for a pending email is refused', async ({ context, page }) => {
    await signIn(context, LEADER.token);
    const email = uniqueEmail('twice');

    await page.goto(TEAM_PAGE);
    await sendInvitation(page, email);
    await expect(page.getByText(email)).toBeVisible();
    await sendInvitation(page, email);

    await expect(page.getByText('Já existe um convite pendente para este e-mail.')).toBeVisible();
});

// Many leaders are allowed, and an admin runs the team like a leader does.
test('an admin invites a new leader, who lands on the home page after the profile step', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, ADMIN.token);
    const email = uniqueEmail('new-leader');

    await page.goto(TEAM_PAGE);
    await sendInvitation(page, email, 'leader');
    await expect(page.getByText(email)).toBeVisible();

    const visitor = await acceptAsNewVisitor(browser, await inviteLink(email));
    await expect(visitor).toHaveURL(/\/auth\/profile\?next=%2F$/);
    expect(await roleOf(email)).toBe('leader');
    await visitor.context().close();
});

// An invitation only ever raises a role: the leader stays a leader, and the
// inviter is told there is nothing to grant.
test('inviting someone who already holds the role or a higher one is refused', async ({
    context,
    page
}) => {
    await signIn(context, LEADER.token);

    await page.goto(TEAM_PAGE);
    await sendInvitation(page, MEMBER.email, 'staff');

    await expect(
        page.getByText('Esta pessoa já faz parte da equipe com essa função ou superior.')
    ).toBeVisible();
    expect(await roleOf(MEMBER.email)).toBe('member');
});

test('an expired or unknown link is refused with its own message', async ({ page }) => {
    const expired = await seedInvitation({
        email: uniqueEmail('late'),
        inviterId: LEADER.id,
        expired: true
    });

    await page.goto(`/invite/${expired}`);
    await expect(
        page.getByText('Este convite expirou. Peça um novo ao seu convidante.')
    ).toBeVisible();

    await page.goto('/invite/no-such-token');
    await expect(page.getByText('Este link de convite não é válido.')).toBeVisible();
});

test('a leader promotes a member to leader, demotes them to staff and removes them; their own row has no controls', async ({
    context,
    page
}) => {
    await signIn(context, LEADER.token);
    const crew = await seedPerson({ role: 'member' });
    const crewRole = () => roleOf(crew.email);

    await page.goto(TEAM_PAGE);
    await waitForHydration(page);
    const row = page.locator('form[action="?/setRole"]', { hasText: crew.email });
    await row.getByRole('combobox').selectOption('leader');
    await expect.poll(crewRole).toBe('leader');
    await row.getByRole('combobox').selectOption('staff');
    await expect.poll(crewRole).toBe('staff');

    await row.getByRole('button', { name: 'Remover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await expect.poll(crewRole).toBe('buyer');

    // The leader's own row offers no controls at all.
    const ownRow = page.locator('form[action="?/setRole"]', { hasText: LEADER.email });
    await expect(ownRow.getByRole('combobox')).toHaveCount(0);
});
