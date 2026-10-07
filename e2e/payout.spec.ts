import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { postFormAction, type ActionAnswer } from './support/form-action';
import { waitForHydration } from './support/hydration';
import { placeOrder } from './support/orders';
import { seedOrganization, seedPerson, type SeededPerson } from './support/people';
import { seedSellableEvent, type SellableEvent } from './support/sellable-event';
import { signIn } from './support/session';
import { queryRows, queryValue } from './support/sql';
import { checkoutCompleted, deliverWebhook } from './support/webhook';

interface PayingEvent {
    event: SellableEvent;
    organizationId: string;
    leader: SeededPerson;
}

/**
 * An event of its own organization, led by a fresh person, that has taken
 * R$ 100,00 in one paid order with an R$ 0,80 fee: R$ 99,20 can be withdrawn.
 * The Pix key lives on the organization, so every test gets its own.
 */
async function seedPayingEvent(): Promise<PayingEvent> {
    const organizationId = await seedOrganization();
    const leader = await seedPerson({
        role: 'creator',
        membership: { organizationId, role: 'leader' }
    });
    const event = await seedSellableEvent({
        ticketPriceCents: 5_000,
        ticketStock: 10,
        organizationId
    });
    const order = await placeOrder(event, { quantity: 2, paymentMethod: 'PIX' });
    await deliverWebhook(checkoutCompleted(order.checkoutId, { platformFee: 80 }));
    return { event, organizationId, leader };
}

async function contextFor(browser: Browser, person: { token: string }): Promise<BrowserContext> {
    const context = await browser.newContext();
    await signIn(context, person.token);
    return context;
}

function dashboard(event: SellableEvent): string {
    return `/events/${event.id}/dashboard`;
}

function saveKey(context: BrowserContext, event: SellableEvent, key: string, type = 'email') {
    return postFormAction(context.request, `${dashboard(event)}?/savePayoutKey`, {
        pix_key: key,
        pix_key_type: type
    });
}

function withdraw(
    context: BrowserContext,
    event: SellableEvent,
    amountCents: string
): Promise<ActionAnswer> {
    return postFormAction(context.request, `${dashboard(event)}?/withdraw`, {
        amount_cents: amountCents
    });
}

function payoutRows(event: SellableEvent) {
    return queryRows<{ status: string; amount: number; key: string; abacate: string | null }>(
        `select status, amount_cents as amount, pix_key as key, abacate_payout_id as abacate
         from payouts where event_id = $1 order by inserted_at, updated_at`,
        [event.id]
    );
}

async function openWithdraw(page: Page, event: SellableEvent): Promise<void> {
    await page.goto(`${dashboard(event)}?withdraw=1`);
    await waitForHydration(page);
}

test('a leader sets the Pix key and withdraws; a second request the same day is refused', async ({
    context,
    page
}) => {
    const { event, organizationId, leader } = await seedPayingEvent();
    await signIn(context, leader.token);
    await openWithdraw(page, event);
    const dialog = page.getByRole('dialog', { name: 'Sacar dinheiro' });

    await expect(dialog.getByText('Disponível: R$ 99,20')).toBeVisible();
    await dialog.getByLabel('Tipo de chave').selectOption('email');
    await dialog.getByLabel('Chave PIX').fill('caixa@e2e.test');
    await dialog.getByRole('button', { name: 'Salvar chave' }).click();
    await expect(dialog.getByRole('button', { name: 'Editar chave' })).toBeVisible();
    expect(
        await queryValue<string>(
            `select pix_key || '/' || pix_key_type from organizations where id = $1`,
            [organizationId]
        )
    ).toBe('caixa@e2e.test/email');

    await dialog.getByLabel('Valor a sacar').fill('50,00');
    await dialog.getByRole('button', { name: 'Confirmar saque' }).click();

    await expect(dialog.getByText('Saque solicitado.')).toBeVisible();
    // The history, the balance and the daily limit are all re-read.
    await expect(dialog.getByRole('listitem')).toContainText('R$ 50,00');
    await expect(dialog.getByRole('listitem')).toContainText('Em processamento');
    await expect(dialog.getByText('Disponível: R$ 49,20')).toBeVisible();
    await expect(dialog.getByText('Você já solicitou um saque hoje.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirmar saque' })).toBeDisabled();
    const [payout] = await payoutRows(event);
    expect(payout).toMatchObject({ status: 'pending', amount: 5_000, key: 'caixa@e2e.test' });
    expect(payout.abacate).toMatch(/^pyt_fake_/);

    // The button is disabled; the server holds the same line on its own.
    const again = await withdraw(context, event, '1000');
    expect(again.data.error).toBe('rate_limited');
    expect(await payoutRows(event)).toHaveLength(1);
});

test('two requests sent together make one payout', async ({ browser }) => {
    const { event, leader } = await seedPayingEvent();
    const context = await contextFor(browser, leader);
    await saveKey(context, event, 'caixa@e2e.test');

    const answers = await Promise.all([
        withdraw(context, event, '3000'),
        withdraw(context, event, '3000')
    ]);

    expect(answers.map((answer) => answer.type).sort()).toEqual(['failure', 'success']);
    expect(await payoutRows(event)).toHaveLength(1);
    await context.close();
});

test('a payout Abacate Pay could not take is marked failed and does not use up the day', async ({
    context,
    page
}) => {
    const { event, leader } = await seedPayingEvent();
    await signIn(context, leader.token);
    // The fake fails payouts to keys that start with `outage+`.
    await saveKey(context, event, 'outage+caixa@e2e.test');
    await openWithdraw(page, event);
    const dialog = page.getByRole('dialog', { name: 'Sacar dinheiro' });

    await dialog.getByLabel('Valor a sacar').fill('50,00');
    await dialog.getByRole('button', { name: 'Confirmar saque' }).click();

    // The attempt is in the history at once, without a reload, and the balance is whole.
    await expect(dialog.getByRole('listitem')).toContainText('Falhou');
    await expect(dialog.getByText('Disponível: R$ 99,20')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirmar saque' })).toBeVisible();
    expect(await payoutRows(event)).toMatchObject([{ status: 'failed', abacate: null }]);
    // Why it failed is kept on the row, for whoever has to find out.
    expect(
        await queryValue<string>('select error_message from payouts where event_id = $1', [
            event.id
        ])
    ).toContain('upstream (503)');
    // Nothing left the balance, so the whole of it can still go, today.
    await saveKey(context, event, 'caixa@e2e.test');
    expect((await withdraw(context, event, '9920')).type).toBe('success');
    expect((await payoutRows(event)).map((row) => row.status)).toEqual(['failed', 'pending']);
});

test('requests that must not go through are refused, and write nothing', async ({ browser }) => {
    const { event, organizationId, leader } = await seedPayingEvent();
    const context = await contextFor(browser, leader);

    expect((await withdraw(context, event, '1000')).data.error).toBe('pix_key_missing');
    for (const [key, type] of [
        ['', 'email'],
        ['caixa@e2e.test', 'iban'],
        ['x'.repeat(256), 'evp']
    ]) {
        expect((await saveKey(context, event, key, type)).data.error, type).toBe('invalid_pix_key');
    }
    await saveKey(context, event, 'caixa@e2e.test');
    for (const amount of ['0', '-5', '1.5', 'abc', '', '500001']) {
        expect((await withdraw(context, event, amount)).data.error, amount).toBe('invalid_amount');
    }
    // One centavo more than the R$ 99,20 the event has.
    expect((await withdraw(context, event, '9921')).data.error).toBe('insufficient_balance');
    await context.close();

    // A participant manages the event but not its money; an outsider sees no event.
    const participant = await contextFor(
        browser,
        await seedPerson({ role: 'creator', membership: { organizationId, role: 'participant' } })
    );
    expect((await withdraw(participant, event, '1000')).data.error).toBe('forbidden');
    expect((await saveKey(participant, event, 'meu@e2e.test')).data.error).toBe('forbidden');
    const page = await participant.newPage();
    await page.goto(`${dashboard(event)}?withdraw=1`);
    await expect(page.getByRole('heading', { name: 'Painel do evento' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Sacar dinheiro' })).toHaveCount(0);
    await participant.close();
    const outsider = await contextFor(browser, await seedPerson({ role: 'creator' }));
    expect((await withdraw(outsider, event, '1000')).data.error).toBe('not_found');
    await outsider.close();

    expect(await payoutRows(event)).toHaveLength(0);
    expect(
        await queryValue<string>('select pix_key from organizations where id = $1', [
            organizationId
        ])
    ).toBe('caixa@e2e.test');
});
