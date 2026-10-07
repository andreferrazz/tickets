import { expect, test } from '@playwright/test';
import { orderColumn, passCount, placeOrder, sold } from './support/orders';
import { emailsTo } from './support/outbox';
import { seedSellableEvent } from './support/sellable-event';
import { queryValue } from './support/sql';
import { checkoutCompleted, checkoutRefunded, deliverWebhook } from './support/webhook';

const PRICED = { ticketPriceCents: 5_000, ticketStock: 5 };

/** How many verified deliveries about `checkoutId` reached the audit log. */
function logged(checkoutId: string | null): Promise<number | null> {
    return queryValue<number>(
        `select count(*)::int from webhook_events
         where coalesce(payload #>> '{data,checkout,id}', payload #>> '{data,transparent,id}') = $1`,
        [checkoutId]
    );
}

test('a paid webhook marks the order paid and issues its passes once, however often it arrives', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { quantity: 2, paymentMethod: 'PIX' });
    // A card payment in two installments, with the fee Abacate Pay says it kept.
    const paid = checkoutCompleted(
        order.checkoutId,
        { installmentsCount: 2, platformFee: 460 },
        'CARD'
    );

    expect(await deliverWebhook(paid)).toBe(200);

    expect(await orderColumn(order.id, 'status')).toBe('paid');
    expect(await orderColumn(order.id, 'paid_at')).not.toBeNull();
    expect(
        await orderColumn(
            order.id,
            `payment_method || '/' || card_installments || '/' || platform_fee_cents`
        )
    ).toBe('CARD/2/460');
    expect(await passCount(order.id)).toBe(2);
    const emails = await emailsTo(order.buyer.email);
    expect(emails.map((email) => [email.subject, email.inlineImages])).toEqual([
        [`Seus ingressos: ${event.title}`, 2]
    ]);

    // Abacate Pay redelivers; the second one is acknowledged and changes nothing.
    expect(await deliverWebhook(paid)).toBe(200);
    expect(await passCount(order.id)).toBe(2);
    expect(await emailsTo(order.buyer.email)).toHaveLength(1);
    expect(await logged(order.checkoutId)).toBe(2);
});

test('a boleto is confirmed by its own event', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'BOLETO' });
    expect(order.checkoutId).toMatch(/^bole_fake_/);

    const status = await deliverWebhook({
        event: 'transparent.completed',
        data: { transparent: { id: order.checkoutId } }
    });

    expect(status).toBe(200);
    expect(await orderColumn(order.id, `status || '/' || payment_method`)).toBe('paid/BOLETO');
    expect(await passCount(order.id)).toBe(1);
});

test('a refund gives the stock back once', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { quantity: 2, paymentMethod: 'PIX' });
    await deliverWebhook(checkoutCompleted(order.checkoutId));
    expect(await sold(event)).toBe(2);

    expect(await deliverWebhook(checkoutRefunded(order.checkoutId))).toBe(200);

    expect(await orderColumn(order.id, 'status')).toBe('refunded');
    expect(await sold(event)).toBe(0);
    // A redelivered refund must not release the stock a second time, and a
    // replayed payment must not un-refund the order.
    expect(await deliverWebhook(checkoutRefunded(order.checkoutId))).toBe(200);
    expect(await deliverWebhook(checkoutCompleted(order.checkoutId))).toBe(200);
    expect(await sold(event)).toBe(0);
    expect(await orderColumn(order.id, 'status')).toBe('refunded');
});

test('a delivery that cannot prove itself is refused, and neither logged nor acted on', async () => {
    const event = await seedSellableEvent(PRICED);
    const order = await placeOrder(event, { paymentMethod: 'PIX' });
    const paid = checkoutCompleted(order.checkoutId);
    const forgeries = [
        { secret: 'not-the-secret' },
        { secret: '' },
        { secret: null },
        { signature: '' },
        { signature: 'bm90LXRoZS1zaWduYXR1cmU=' }
    ];

    for (const forgery of forgeries) {
        expect(await deliverWebhook(paid, forgery), JSON.stringify(forgery)).toBe(401);
    }

    expect(await orderColumn(order.id, 'status')).toBe('pending');
    expect(await passCount(order.id)).toBe(0);
    expect(await logged(order.checkoutId)).toBe(0);
});

test('deliveries that are genuine but not for us are answered without harm', async () => {
    const stranger = `bill_e2e_unknown_${Date.now()}`;

    // An order we do not have: 404, so Abacate Pay tries again later. Still logged.
    expect(await deliverWebhook(checkoutCompleted(stranger))).toBe(404);
    expect(await deliverWebhook(checkoutRefunded(stranger))).toBe(404);
    expect(await logged(stranger)).toBe(2);
    // An event we do not act on, or one with no id to act on: acknowledged.
    expect(await deliverWebhook({ event: 'payout.completed', data: { id: 'pyt_1' } })).toBe(200);
    expect(await deliverWebhook({ event: 'checkout.completed', data: {} })).toBe(200);
    expect(await deliverWebhook([])).toBe(200);
    // Signed, but not JSON.
    expect(await deliverWebhook('not json')).toBe(400);
});
