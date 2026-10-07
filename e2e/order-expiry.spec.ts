import { expect, test } from '@playwright/test';
import { cutOffFakeAbacate, payAtFakeAbacate, runReconciler } from './support/fake-abacate';
import { makeStale, orderColumn, passCount, placeOrder, sold } from './support/orders';
import { emailsTo } from './support/outbox';
import { seedSellableEvent } from './support/sellable-event';
import { execute } from './support/sql';
import { checkoutCompleted, deliverWebhook } from './support/webhook';

// The sweep runs on a timer in production; here each test runs it by hand
// through `/e2e-fakes/reconcile`. It sweeps every stale order there is, so a
// test only ever asserts on the orders it made stale itself.
const PRICED = { ticketPriceCents: 5_000, ticketStock: 5 };

test('a stale unpaid order expires and frees its stock; a fresh one is left alone', async () => {
    const event = await seedSellableEvent(PRICED);
    const stale = await placeOrder(event, { quantity: 2, paymentMethod: 'PIX' });
    const fresh = await placeOrder(event, { paymentMethod: 'PIX' });
    await makeStale(stale.id);

    await runReconciler();

    expect(await orderColumn(stale.id, 'status')).toBe('expired');
    expect(await orderColumn(fresh.id, 'status')).toBe('pending');
    expect(await sold(event)).toBe(1);
    expect(await passCount(stale.id)).toBe(0);
});

test('a stale order that was paid at Abacate Pay is fulfilled: the webhook was missed', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { quantity: 2, paymentMethod: 'PIX' });
    await payAtFakeAbacate(order.checkoutId as string);
    await makeStale(order.id);

    await runReconciler();

    expect(await orderColumn(order.id, 'status')).toBe('paid');
    expect(await passCount(order.id)).toBe(2);
    expect(await sold(event)).toBe(2);
    expect((await emailsTo(order.buyer.email)).map((email) => email.subject)).toEqual([
        `Seus ingressos: ${event.title}`
    ]);
    // The next sweep has nothing left to do with it.
    await runReconciler();
    expect(await passCount(order.id)).toBe(2);
    expect(await emailsTo(order.buyer.email)).toHaveLength(1);
});

test('a boleto is held until its due date, then expires', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'BOLETO' });
    await makeStale(order.id);

    await runReconciler();

    // Twenty minutes old, but a boleto takes days to pay.
    expect(await orderColumn(order.id, 'status')).toBe('pending');
    expect(await sold(event)).toBe(1);

    await execute(
        `update orders set expires_at = (now() at time zone 'utc') - interval '1 hour' where id = $1`,
        [order.id]
    );
    await runReconciler();

    expect(await orderColumn(order.id, 'status')).toBe('expired');
    expect(await sold(event)).toBe(0);
});

test('an order Abacate Pay cannot be asked about is left for the next sweep', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'PIX' });
    await cutOffFakeAbacate(order.checkoutId as string);
    await makeStale(order.id);

    await runReconciler();

    // It may have been paid; expiring it on a guess would sell its ticket twice.
    expect(await orderColumn(order.id, 'status')).toBe('pending');
    expect(await sold(event)).toBe(1);
});

test('an order that never reached Abacate Pay expires on age alone', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'PIX' });
    // What a crash between reserving the stock and storing the checkout leaves behind.
    await execute(
        `update orders set abacate_checkout_id = null, abacate_payment_url = null where id = $1`,
        [order.id]
    );
    await makeStale(order.id);

    await runReconciler();

    expect(await orderColumn(order.id, 'status')).toBe('expired');
    expect(await sold(event)).toBe(0);
});

test('a payment that lands after the order expired is still honoured', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'PIX' });
    await makeStale(order.id);
    await runReconciler();
    expect(await orderColumn(order.id, 'status')).toBe('expired');

    // The hosted checkout cannot be closed from our side, so this can happen.
    expect(await deliverWebhook(checkoutCompleted(order.checkoutId))).toBe(200);

    expect(await orderColumn(order.id, 'status')).toBe('paid');
    expect(await passCount(order.id)).toBe(1);
});
