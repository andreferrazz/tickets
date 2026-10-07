import { request } from '@playwright/test';
import { E2E_BASE_URL } from './base-url';
import { postFormAction } from './form-action';
import { seedPerson, type SeededPerson } from './people';
import type { SellableEvent } from './sellable-event';
import { SESSION_COOKIE } from './session';
import { execute, queryRows, queryValue } from './sql';

export interface NewOrder {
    /** Defaults to one ticket. */
    quantity?: number;
    /** Leave out for a free event; a priced one needs a method. */
    paymentMethod?: 'PIX' | 'BOLETO';
    /** Defaults to a fresh buyer, so the order is the only one they have. */
    buyer?: SeededPerson;
}

export interface PlacedOrder {
    id: string;
    /** The fake Abacate id the order was opened with; null for a free order. */
    checkoutId: string | null;
    buyer: SeededPerson;
}

// A boleto is issued to a name and a tax id, so its buyers are seeded with one.
const BOLETO_TAX_ID = '39053344705';

/**
 * An order placed through the real `buy` action, without a browser: for specs
 * whose subject is what happens to an order afterwards.
 *
 * @example
 * const order = await placeOrder(event, { paymentMethod: 'PIX' });
 * await deliverWebhook(checkoutCompleted(order.checkoutId));
 */
export async function placeOrder(event: SellableEvent, order: NewOrder = {}): Promise<PlacedOrder> {
    const taxId = order.paymentMethod === 'BOLETO' ? BOLETO_TAX_ID : undefined;
    const buyer = order.buyer ?? (await seedPerson({ role: 'buyer', taxId }));
    const api = await request.newContext({
        baseURL: E2E_BASE_URL,
        extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${buyer.token}` }
    });
    const answer = await postFormAction(api, `/events/${event.id}?/buy`, {
        [`ticket:${event.ticketTypeId}`]: `${order.quantity ?? 1}`,
        payment_method: order.paymentMethod ?? ''
    });
    await api.dispose();
    if (answer.type !== 'redirect') throw new Error(`buy answered ${JSON.stringify(answer)}`);
    return { ...(await newestOrder(buyer.id, event.id)), buyer };
}

async function newestOrder(
    userId: string,
    eventId: string
): Promise<Pick<PlacedOrder, 'id' | 'checkoutId'>> {
    const [row] = await queryRows<{ id: string; checkoutId: string | null }>(
        `select id, abacate_checkout_id as "checkoutId" from orders
         where user_id = $1 and event_id = $2 order by inserted_at desc, id desc limit 1`,
        [userId, eventId]
    );
    return row;
}

/** How many of the event's tickets are held by orders right now. */
export function sold(event: SellableEvent): Promise<number | null> {
    return queryValue<number>('select quantity_sold from ticket_batches where id = $1', [
        event.batchId
    ]);
}

/** One column of an order, as text, for facts its page does not show. */
export function orderColumn(orderId: string, column: string): Promise<string | null> {
    return queryValue<string>(`select ${column}::text from orders where id = $1`, [orderId]);
}

export function passCount(orderId: string): Promise<number | null> {
    return queryValue<number>('select count(*)::int from passes where order_id = $1', [orderId]);
}

/**
 * Makes the order twenty minutes old, past the reconciler's fifteen. Do this
 * last, after the fake Abacate has been told what to say about it: another
 * test's sweep may pick the order up the moment it is stale.
 */
export async function makeStale(orderId: string): Promise<void> {
    await execute(
        `update orders set inserted_at = inserted_at - interval '20 minutes' where id = $1`,
        [orderId]
    );
}
