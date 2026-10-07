import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { payAtFakeAbacate } from './support/fake-abacate';
import { MEMBER, OTHER_ORG, OWN_ORG_DRAFT, PUBLISHED_TICKET_TYPE } from './support/fixtures';
import { postFormAction, type ActionAnswer } from './support/form-action';
import { waitForHydration } from './support/hydration';
import { orderColumn, passCount, placeOrder, sold } from './support/orders';
import { emailsTo } from './support/outbox';
import { seedPerson } from './support/people';
import { VALID_CPF } from './support/profile';
import { seedSellableEvent, type SellableEvent } from './support/sellable-event';
import { signIn } from './support/session';
import { queryValue } from './support/sql';
import { uniqueEmail } from './support/unique';

const QR_CODES = 'img[src^="data:image/png"]';

function orderIdFrom(page: Page): string {
    return new URL(page.url()).pathname.split('/').at(-1) as string;
}

async function contextFor(browser: Browser, person: { token: string }): Promise<BrowserContext> {
    const context = await browser.newContext();
    await signIn(context, person.token);
    return context;
}

/** Opens the event and puts `tickets` tickets (and `extras` of its extra) in the cart. */
async function fillCart(page: Page, event: SellableEvent, tickets: number, extras = 0) {
    await page.goto(`/events/${event.id}`);
    await waitForHydration(page);
    const plus = page.getByRole('button', { name: '+' });
    for (let i = 0; i < tickets; i++) await plus.nth(0).click();
    for (let i = 0; i < extras; i++) await plus.nth(1).click();
}

/** Presses "cancel" on the page and confirms in the dialog that follows. */
async function cancelFromPage(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    const confirmation = page.getByRole('dialog', { name: /Tem certeza/ });
    await confirmation.getByRole('button', { name: 'Cancelar pedido' }).click();
}

/** Posts the buy action directly: the refusals a page never lets a person reach. */
function buy(
    context: BrowserContext,
    eventId: string,
    form: Record<string, string>
): Promise<ActionAnswer> {
    return postFormAction(context.request, `/events/${eventId}?/buy`, form);
}

test('a free order is paid on the spot, with its passes on the page and in the mail', async ({
    context,
    page
}) => {
    const buyer = await seedPerson({ role: 'buyer' });
    const event = await seedSellableEvent({
        ticketPriceCents: 0,
        ticketStock: 5,
        extra: { priceCents: 0, stock: null }
    });
    await signIn(context, buyer.token);
    await fillCart(page, event, 2, 1);

    await page.getByRole('button', { name: 'Comprar' }).click();

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    await expect(page.locator('.badge.paid')).toHaveText('Pago');
    // One QR code per ticket, one for all the extras.
    await expect(page.locator(QR_CODES)).toHaveCount(3);
    expect(await sold(event)).toBe(2);
    const emails = await emailsTo(buyer.email);
    expect(emails.map((email) => [email.subject, email.inlineImages])).toEqual([
        [`Seus ingressos: ${event.title}`, 2],
        [`Seus extras: ${event.title}`, 1]
    ]);
    expect(emails[1].text).toContain(`- ${event.extraName} × 1`);
    expect(emails[0].text).toContain(`/orders/${orderIdFrom(page)}`);
});

test('cancelling a free order gives the stock back and kills its passes', async ({
    context,
    page
}) => {
    const buyer = await seedPerson({ role: 'buyer' });
    const event = await seedSellableEvent({ ticketPriceCents: 0, ticketStock: 5 });
    await signIn(context, buyer.token);
    await fillCart(page, event, 2);
    await page.getByRole('button', { name: 'Comprar' }).click();
    await expect(page.locator(QR_CODES)).toHaveCount(2);
    const orderId = orderIdFrom(page);

    await cancelFromPage(page);

    await expect(page.locator('.badge.cancelled')).toHaveText('Cancelado');
    await expect(page.locator(QR_CODES)).toHaveCount(0);
    expect(await sold(event)).toBe(0);
    // A pass is validated by its token alone, so the rows themselves must go.
    expect(await passCount(orderId)).toBe(0);
});

test('a paid order waits for payment, and one paid behind our back is fulfilled, not cancelled', async ({
    context,
    page
}) => {
    const buyer = await seedPerson({ role: 'buyer' });
    const event = await seedSellableEvent({ ticketPriceCents: 5_000, ticketStock: 3 });
    await signIn(context, buyer.token);
    await fillCart(page, event, 1);

    await page.getByRole('button', { name: 'Comprar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pix' }).click();

    // The fake's payment page is the order page itself: the buyer "comes back".
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    await expect(page.locator('.badge.pending')).toHaveText('Pendente');
    await expect(page.getByRole('link', { name: 'Concluir pagamento' })).toBeVisible();
    const orderId = orderIdFrom(page);
    const checkoutId = (await orderColumn(orderId, 'abacate_checkout_id')) as string;
    expect(checkoutId).toMatch(/^bill_fake_/);
    expect(await orderColumn(orderId, 'payment_method')).toBe('PIX');
    expect(await orderColumn(orderId, 'total_cents')).toBe('5000');
    // Stock is held from the moment the order exists, before any money moves.
    expect(await sold(event)).toBe(1);
    expect(await emailsTo(buyer.email)).toHaveLength(0);

    // The buyer pays, and presses cancel before any webhook has told us.
    await payAtFakeAbacate(checkoutId);
    await cancelFromPage(page);

    await expect(page.getByText('Este pedido já foi pago')).toBeVisible();
    await expect(page.locator('.badge.paid')).toHaveText('Pago');
    await expect(page.locator(QR_CODES)).toHaveCount(1);
    expect(await sold(event)).toBe(1);
    expect((await emailsTo(buyer.email)).map((email) => email.subject)).toEqual([
        `Seus ingressos: ${event.title}`
    ]);
});

test('a boleto sends the buyer to the provider; cancelling it from the list frees the stock', async ({
    context,
    page
}) => {
    const buyer = await seedPerson({ role: 'buyer', taxId: VALID_CPF.replace(/\D/g, '') });
    const event = await seedSellableEvent({ ticketPriceCents: 5_000, ticketStock: 3 });
    await signIn(context, buyer.token);
    // The boleto lives on Abacate Pay's side; stand in for it so the browser arrives somewhere.
    await page.route('https://fake.abacatepay.invalid/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<h1>boleto</h1>' })
    );
    await fillCart(page, event, 2);

    await page.getByRole('button', { name: 'Comprar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Boleto' }).click();

    await expect(page).toHaveURL(/^https:\/\/fake\.abacatepay\.invalid\/boleto\/bole_fake_/);
    const orderId = (await queryValue<string>(
        'select id::text from orders where user_id = $1 and event_id = $2',
        [buyer.id, event.id]
    )) as string;
    expect(await orderColumn(orderId, 'payment_method')).toBe('BOLETO');
    expect(await orderColumn(orderId, 'expires_at')).not.toBeNull();
    expect(await sold(event)).toBe(2);

    await page.goto('/orders');
    await waitForHydration(page);
    await cancelFromPage(page);

    await expect(page.locator('.badge.cancelled')).toHaveText('Cancelado');
    expect(await sold(event)).toBe(0);
});

test('the last ticket goes to one buyer; selling out closes the batch and a cancellation reopens it', async ({
    browser,
    page
}) => {
    const event = await seedSellableEvent({ ticketPriceCents: 0, ticketStock: 1 });
    const rivals = [await seedPerson({ role: 'buyer' }), await seedPerson({ role: 'buyer' })];
    const contexts = await Promise.all(rivals.map((rival) => contextFor(browser, rival)));
    const cart = { [`ticket:${event.ticketTypeId}`]: '1' };

    const answers = await Promise.all(contexts.map((context) => buy(context, event.id, cart)));

    expect(answers.map((answer) => answer.type).sort()).toEqual(['failure', 'redirect']);
    const refused = answers.find((answer) => answer.type === 'failure') as ActionAnswer;
    expect(refused.data).toMatchObject({ error: 'out_of_stock', itemName: event.ticketName });
    expect(await sold(event)).toBe(1);
    await page.goto(`/events/${event.id}`);
    await expect(page.getByText('Esgotado')).toBeVisible();

    const winner = answers.findIndex((answer) => answer.type === 'redirect');
    const cancelled = await postFormAction(
        contexts[winner].request,
        `${answers[winner].location}?/cancel`,
        {}
    );

    expect(cancelled.type).toBe('success');
    expect(await sold(event)).toBe(0);
    expect(
        await queryValue<string>('select closed_at::text from ticket_batches where id = $1', [
            event.batchId
        ])
    ).toBeNull();
    await Promise.all(contexts.map((context) => context.close()));
});

test('carts the page would never send are refused, and reserve nothing', async ({
    browser,
    request
}) => {
    const event = await seedSellableEvent({
        ticketPriceCents: 5_000,
        ticketStock: 5,
        extra: { priceCents: 0, stock: 5, limitToTicketCount: true }
    });
    const context = await contextFor(browser, await seedPerson({ role: 'buyer' }));
    const ticket = `ticket:${event.ticketTypeId}`;
    const refusals: [Record<string, string>, string][] = [
        [{}, 'no_items'],
        [{ [ticket]: '0' }, 'no_items'],
        [{ [ticket]: '1.5', payment_method: 'PIX' }, 'invalid_item'],
        [{ [ticket]: '-1', payment_method: 'PIX' }, 'invalid_item'],
        [{ [ticket]: '6', payment_method: 'PIX' }, 'out_of_stock'],
        // Another event's ticket type, and one extra more than there are tickets.
        [{ [`ticket:${PUBLISHED_TICKET_TYPE.id}`]: '1', payment_method: 'PIX' }, 'invalid_item'],
        [
            { [ticket]: '1', [`extra:${event.extraId}`]: '2', payment_method: 'PIX' },
            'extra_exceeds_tickets'
        ],
        [{ [ticket]: '1' }, 'invalid_payment_method'],
        [{ [ticket]: '1', payment_method: 'CASH' }, 'invalid_payment_method'],
        // Seeded buyers have no tax id, and a boleto is issued to one.
        [{ [ticket]: '1', payment_method: 'BOLETO' }, 'profile_incomplete']
    ];

    for (const [form, error] of refusals) {
        const answer = await buy(context, event.id, form);
        expect(answer.data.error, JSON.stringify(form)).toBe(error);
    }
    expect((await buy(context, OWN_ORG_DRAFT.id, { [ticket]: '1' })).data.error).toBe(
        'event_not_available'
    );
    // An anonymous buyer is sent to log in and brought back to the event.
    const anonymous = await postFormAction(request, `/events/${event.id}?/buy`, { [ticket]: '1' });
    expect(anonymous.location).toBe(
        `/auth/login?next=${encodeURIComponent(`/events/${event.id}`)}`
    );

    expect(await sold(event)).toBe(0);
    expect(
        await queryValue<number>('select count(*)::int from orders where event_id = $1', [event.id])
    ).toBe(0);
    await context.close();
});

test('a manager cancels a buyer’s order from the event’s list; nobody else can', async ({
    browser,
    context,
    page
}) => {
    const event = await seedSellableEvent({ ticketPriceCents: 0, ticketStock: 5 });
    const { id: orderId } = await placeOrder(event, { quantity: 2 });
    const outsiders = [
        await seedPerson({ role: 'buyer' }),
        await seedPerson({
            role: 'creator',
            membership: { organizationId: OTHER_ORG.id, role: 'participant' }
        })
    ];
    for (const outsider of outsiders) {
        const theirs = await contextFor(browser, outsider);
        const asBuyer = await postFormAction(theirs.request, `/orders/${orderId}?/cancel`, {});
        const asManager = await postFormAction(
            theirs.request,
            `/events/${event.id}/orders?/cancel`,
            {
                order_id: orderId
            }
        );
        // "Not yours" and "does not exist" are one answer.
        expect([asBuyer.data.error, asManager.data.error]).toEqual(['not_found', 'not_found']);
        await theirs.close();
    }
    expect(await orderColumn(orderId, 'status')).toBe('paid');

    await signIn(context, MEMBER.token);
    await page.goto(`/events/${event.id}/orders`);
    await waitForHydration(page);
    await page.getByRole('button', { name: /E2E Seeded/ }).click();
    await cancelFromPage(page);

    await expect.poll(() => orderColumn(orderId, 'status')).toBe('cancelled');
    expect(await sold(event)).toBe(0);
});

test('a manager sends free tickets to a guest list; a guest past the stock is skipped', async ({
    browser,
    context,
    page
}) => {
    // Priced on purpose: a comp is free whatever the batch costs.
    const event = await seedSellableEvent({ ticketPriceCents: 5_000, ticketStock: 3 });
    const [guest, unlucky] = [uniqueEmail('comp-guest'), uniqueEmail('comp-unlucky')];
    await signIn(context, MEMBER.token);
    await page.goto(`/events/${event.id}/comp`);
    await waitForHydration(page);

    await page.getByPlaceholder('email@convidado.com').fill(guest);
    await page.getByLabel('Qtd').fill('2');
    await page.getByRole('button', { name: '+ Adicionar convidado' }).click();
    await page.getByPlaceholder('email@convidado.com').nth(1).fill(unlucky);
    await page.getByLabel('Qtd').nth(1).fill('2');
    await page.getByRole('button', { name: 'Enviar ingressos' }).click();

    await expect(page.getByRole('heading', { name: 'Enviados (1)' })).toBeVisible();
    await expect(page.locator('.sent')).toContainText(guest);
    await expect(page.locator('.failed')).toContainText(`${unlucky} — Esgotado`);
    // The guest had no account; they own a paid order of nothing and two passes.
    expect(
        await queryValue<string>(
            `select o.status || ':' || o.total_cents from orders o join users u on u.id = o.user_id
             where u.email = $1 and u.role = 'buyer' and o.event_id = $2`,
            [guest, event.id]
        )
    ).toBe('paid:0');
    expect(await sold(event)).toBe(2);
    const [mail] = await emailsTo(guest);
    expect([mail.subject, mail.inlineImages]).toEqual([`Seus ingressos: ${event.title}`, 2]);
    expect(await emailsTo(unlucky)).toHaveLength(0);

    const outsider = await contextFor(browser, await seedPerson({ role: 'buyer' }));
    // 404, not 403: the page must not confirm the event has a comp page to guard.
    expect((await outsider.request.get(`/events/${event.id}/comp`)).status()).toBe(404);
    const posted = await postFormAction(outsider.request, `/events/${event.id}/comp?/send`, {
        ticket_type_id: event.ticketTypeId,
        email: uniqueEmail('comp-stolen'),
        quantity: '1'
    });
    expect(posted.data.error).toBe('not_found');
    expect(await sold(event)).toBe(2);
    await outsider.close();
});
