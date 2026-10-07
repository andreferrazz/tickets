import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, DRAFT_ORG, MEMBER } from './support/fixtures';
import { signIn } from './support/session';
import { execute, queryValue } from './support/sql';

const TEAM_PAGE = `/organizations/${DRAFT_ORG.id}/invitations`;

/** The accept link of the newest invitation to `email`, read from the row the email carries. */
async function inviteLink(email: string): Promise<string> {
    const token = await queryValue<string>(
        'select token from invitations where email = $1 order by inserted_at desc limit 1',
        [email]
    );
    if (!token) throw new Error(`no invitation for ${email}`);
    return `/invite/${token}`;
}

/** Opens the link as a fresh visitor and waits for the page to sign them in and move on. */
async function acceptAsNewVisitor(browser: Browser, link: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link);
    await expect(page).not.toHaveURL(/\/invite\//);
    return page;
}

test('a leader invites a participant, who joins by opening the link', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, MEMBER.token);
    const email = 'new-participant@e2e.test';

    await page.goto(TEAM_PAGE);
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(page.getByText(email)).toBeVisible();

    const visitor = await acceptAsNewVisitor(browser, await inviteLink(email));
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
    expect(
        await queryValue<string>('select status from invitations where email = $1', [email])
    ).toBe('accepted');
    await visitor.context().close();
});

test('a second invitation for a pending email is refused', async ({ context, page }) => {
    await signIn(context, MEMBER.token);
    const email = 'twice@e2e.test';

    await page.goto(TEAM_PAGE);
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(page.getByText(email)).toBeVisible();
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page.getByText('Já existe um convite pendente para este e-mail.')).toBeVisible();
});

test('an admin invites a new leader, whose organization is born with the invitation and renamed on arrival', async ({
    browser,
    context,
    page
}) => {
    await signIn(context, ADMIN.token);
    const email = 'new-leader@e2e.test';

    await page.goto('/admin/invitations');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(page.getByText(email)).toBeVisible();

    const organizationId = await queryValue<string>(
        'select organization_id from invitations where email = $1',
        [email]
    );
    expect(
        await queryValue<string>('select name from organizations where id = $1', [organizationId])
    ).toBe("new-leader's Org");

    const visitor = await acceptAsNewVisitor(browser, await inviteLink(email));
    // Profile first, then the rename form the link pointed at.
    await expect(visitor).toHaveURL(/\/auth\/profile\?next=%2Fonboarding/);
    await visitor.getByLabel('Nome completo').fill('Nova Líder');
    await visitor.getByLabel('Celular').fill('(11) 99999-9999');
    await visitor.getByLabel('CPF ou CNPJ').fill('390.533.447-05');
    await visitor.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(visitor).toHaveURL(`/onboarding/organization/${organizationId}`);
    await expect(visitor.getByLabel('Nome da organização')).toHaveValue("new-leader's Org");

    await visitor.getByLabel('Nome da organização').fill('Festas da Nova');
    await visitor.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(visitor).toHaveURL('/');
    expect(
        await queryValue<string>('select name from organizations where id = $1', [organizationId])
    ).toBe('Festas da Nova');
    await visitor.context().close();
});

test('a used or expired link is refused with its own message', async ({ page }) => {
    await execute(
        `insert into invitations (inviter_id, organization_id, role, email, status, token, expires_at, inserted_at)
         values ($1, $2, 'participant', 'late@e2e.test', 'pending', 'e2e-expired-token',
                 (now() at time zone 'utc') - interval '1 hour', now() at time zone 'utc')`,
        [MEMBER.id, DRAFT_ORG.id]
    );

    await page.goto('/invite/e2e-expired-token');
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
    // A member to act on, added straight to the organization.
    await execute(
        `insert into users (id, email, role, inserted_at, updated_at)
         values ('00000000-0000-4000-8000-000000000012', 'crew@e2e.test', 'creator', now() at time zone 'utc', now() at time zone 'utc')
         on conflict (id) do nothing`,
        []
    );
    await execute(
        `insert into organization_memberships (organization_id, user_id, role, inserted_at, updated_at)
         values ($1, '00000000-0000-4000-8000-000000000012', 'participant', now() at time zone 'utc', now() at time zone 'utc')
         on conflict do nothing`,
        [DRAFT_ORG.id]
    );

    await page.goto(TEAM_PAGE);
    // The select submits its row on change, which needs the page hydrated first.
    await page.waitForLoadState('networkidle');
    const row = page.locator('form[action="?/setRole"]', { hasText: 'crew@e2e.test' });
    await row.getByRole('combobox').selectOption('staff');
    await expect
        .poll(() =>
            queryValue<string>(
                `select role from organization_memberships where organization_id = $1 and user_id = '00000000-0000-4000-8000-000000000012'`,
                [DRAFT_ORG.id]
            )
        )
        .toBe('staff');

    await row.getByRole('button', { name: 'Remover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await expect
        .poll(() =>
            queryValue<string>(
                `select role from organization_memberships where organization_id = $1 and user_id = '00000000-0000-4000-8000-000000000012'`,
                [DRAFT_ORG.id]
            )
        )
        .toBeNull();

    // The leader's own row offers no controls at all.
    const leaderRow = page.locator('form[action="?/setRole"]', { hasText: MEMBER.email });
    await expect(leaderRow.getByRole('combobox')).toHaveCount(0);
});
