import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E_BASE_URL } from './support/base-url';
import { ADMIN, DRAFT_ORG, MEMBER } from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { latestEmail } from './support/outbox';
import { seedInvitation, seedPerson } from './support/people';
import { completeProfile } from './support/profile';
import { signIn } from './support/session';
import { queryValue } from './support/sql';
import { uniqueEmail } from './support/unique';

const TEAM_PAGE = `/organizations/${DRAFT_ORG.id}/invitations`;

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

async function sendInvitation(page: Page, email: string): Promise<void> {
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill(email);
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

test('a leader invites a participant, who joins by opening the link once', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, MEMBER.token);
    const email = uniqueEmail('new-participant');

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
    expect(await queryValue<string>('select role from users where email = $1', [email])).toBe(
        'creator'
    );
    expect(
        await queryValue<string>(
            `select m.role from organization_memberships m join users u on u.id = m.user_id
             where u.email = $1 and m.organization_id = $2`,
            [email, DRAFT_ORG.id]
        )
    ).toBe('participant');
    expect(await invitationStatus(email)).toBe('accepted');

    await visitor.goto(link);
    await expect(visitor.getByText('Este convite já foi utilizado.')).toBeVisible();
    await visitor.context().close();
});

test('a second invitation for a pending email is refused', async ({ context, page }) => {
    await signIn(context, MEMBER.token);
    const email = uniqueEmail('twice');

    await page.goto(TEAM_PAGE);
    await sendInvitation(page, email);
    await expect(page.getByText(email)).toBeVisible();
    await sendInvitation(page, email);

    await expect(page.getByText('Já existe um convite pendente para este e-mail.')).toBeVisible();
});

test('an admin invites a new leader, whose organization is born with the invitation and renamed on arrival', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, ADMIN.token);
    const email = uniqueEmail('new-leader');
    const placeholderName = `${email.split('@')[0]}'s Org`;

    await page.goto('/admin/invitations');
    await sendInvitation(page, email);
    await expect(page.getByText(email)).toBeVisible();

    const organizationId = await queryValue<string>(
        'select organization_id from invitations where email = $1',
        [email]
    );
    const organizationName = () =>
        queryValue<string>('select name from organizations where id = $1', [organizationId]);
    expect(await organizationName()).toBe(placeholderName);

    const visitor = await acceptAsNewVisitor(browser, await inviteLink(email));
    // Profile first, then the rename form the link pointed at.
    await expect(visitor).toHaveURL(/\/auth\/profile\?next=%2Fonboarding/);
    await completeProfile(visitor);
    await expect(visitor).toHaveURL(`/onboarding/organization/${organizationId}`);
    await expect(visitor.getByLabel('Nome da organização')).toHaveValue(placeholderName);

    await visitor.getByLabel('Nome da organização').fill('E2E Festas da Nova');
    await visitor.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(visitor).toHaveURL('/');
    expect(await organizationName()).toBe('E2E Festas da Nova');
    await visitor.context().close();
});

test('an expired or unknown link is refused with its own message', async ({ page }) => {
    const expired = await seedInvitation({
        email: uniqueEmail('late'),
        inviterId: MEMBER.id,
        organizationId: DRAFT_ORG.id,
        expired: true
    });

    await page.goto(`/invite/${expired}`);
    await expect(
        page.getByText('Este convite expirou. Peça um novo ao seu convidante.')
    ).toBeVisible();

    await page.goto('/invite/no-such-token');
    await expect(page.getByText('Este link de convite não é válido.')).toBeVisible();
});

test('a manager demotes a member to staff and removes them; the leader row is untouchable', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);
    const crew = await seedPerson({
        role: 'creator',
        membership: { organizationId: DRAFT_ORG.id, role: 'participant' }
    });
    const crewRole = () =>
        queryValue<string>(
            'select role from organization_memberships where organization_id = $1 and user_id = $2',
            [DRAFT_ORG.id, crew.id]
        );

    await page.goto(TEAM_PAGE);
    await waitForHydration(page);
    const row = page.locator('form[action="?/setRole"]', { hasText: crew.email });
    await row.getByRole('combobox').selectOption('staff');
    await expect.poll(crewRole).toBe('staff');

    await row.getByRole('button', { name: 'Remover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await expect.poll(crewRole).toBeNull();

    // The leader's own row offers no controls at all.
    const leaderRow = page.locator('form[action="?/setRole"]', { hasText: MEMBER.email });
    await expect(leaderRow.getByRole('combobox')).toHaveCount(0);
});
