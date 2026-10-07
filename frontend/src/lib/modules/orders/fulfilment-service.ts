import { randomBytes } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import type { Mailer, OutgoingEmail } from '$lib/integrations/mail/mailer';
import type { PassRepository } from '$lib/modules/passes/repository';
import type { IssuedPassRow, PassDraft } from '$lib/modules/passes/types';
import type { FulfilmentHeaderRow, OrderStateRepository } from './order-state-repository';
import { extrasEmail, ticketsEmail, type PassEmailContext } from './pass-emails';
import type { OrderRepository } from './repository';
import type { OrderItemRow } from './types';

/**
 * Turns a paid order into passes and mails them, as
 * `Backend.Orders.fulfill_paid_order/1` did. Safe to repeat: Abacate Pay may
 * deliver the same payment more than once, and only the call that issues the
 * passes sends the emails.
 *
 * @example
 * await orderStates.markPaid(order.id, payment);
 * await fulfilment.fulfil(order.id, url.origin);
 */
export interface OrderFulfilment {
    /** `origin` is the site's own, for the order link in the emails. */
    fulfil(orderId: string, origin: string): Promise<void>;
}

export interface OrderFulfilmentDeps {
    queryable: Queryable;
    orderStates: OrderStateRepository;
    orders: OrderRepository;
    passes: PassRepository;
    mailer: Mailer;
}

// 18 random bytes, url-safe: the 24 characters `Backend.Tickets` put in a QR code.
const TOKEN_BYTES = 18;
/** The name of the single pass that stands for every extra of an order. */
const EXTRAS_PASS_NAME = 'Extras';

export function getOrderFulfilment(deps: OrderFulfilmentDeps): OrderFulfilment {
    return {
        async fulfil(orderId, origin) {
            const header = await deps.orderStates.findFulfilmentHeader(orderId);
            if (!header)
                throw new Error(`fulfil expects the id of an existing order, got: ${orderId}`);
            const items = await deps.orders.listItems([orderId]);
            const issued = await issueOnce(deps, header, items);
            if (!issued) return;
            const context = {
                to: header.buyer_email,
                eventTitle: header.event_title,
                orderUrl: `${origin}/orders/${orderId}`
            };
            await deliverPassEmails(deps.mailer, context, issued, items);
        }
    };
}

// Null when the order already had passes. The row lock makes two deliveries
// of the same payment take turns, so the second one sees the first one's passes.
function issueOnce(
    deps: OrderFulfilmentDeps,
    header: FulfilmentHeaderRow,
    items: OrderItemRow[]
): Promise<IssuedPassRow[] | null> {
    const owner = { orderId: header.id, eventId: header.event_id, userId: header.user_id };
    return deps.queryable.transaction(async (tx) => {
        await deps.orderStates.lockOrder(tx, header.id);
        if ((await deps.passes.listIssued(tx, header.id)).length > 0) return null;
        const issued: IssuedPassRow[] = [];
        for (const draft of draftPasses(items)) {
            issued.push(await deps.passes.insertIssued(tx, owner, draft));
        }
        return issued;
    });
}

// One pass per ticket unit; every extra of the order shares a single pass.
function draftPasses(items: OrderItemRow[]): PassDraft[] {
    const tickets = items
        .filter((item) => item.item_type === 'ticket')
        .flatMap((item) =>
            Array.from({ length: item.quantity }, () => draft('ticket', item.item_name, item.id))
        );
    const hasExtras = items.some((item) => item.item_type === 'extra');
    return hasExtras ? [...tickets, draft('extra', EXTRAS_PASS_NAME, null)] : tickets;
}

function draft(kind: PassDraft['kind'], itemName: string, orderItemId: string | null): PassDraft {
    return { token: randomBytes(TOKEN_BYTES).toString('base64url'), kind, itemName, orderItemId };
}

async function deliverPassEmails(
    mailer: Mailer,
    context: PassEmailContext,
    passes: IssuedPassRow[],
    items: OrderItemRow[]
): Promise<void> {
    const emailed = passes.map((pass) => ({ token: pass.token, itemName: pass.item_name }));
    const tickets = emailed.filter((_, index) => passes[index].kind === 'ticket');
    const extras = emailed.find((_, index) => passes[index].kind === 'extra');
    if (tickets.length > 0) await sendOrLog(mailer, await ticketsEmail(context, tickets));
    if (!extras) return;
    const lines = items
        .filter((item) => item.item_type === 'extra')
        .map((item) => ({ name: item.item_name, quantity: item.quantity }));
    await sendOrLog(mailer, await extrasEmail(context, extras, lines));
}

// A mail server that is down must not undo a payment: the passes exist and the
// order page shows them, so the failure is logged and the order stays fulfilled.
async function sendOrLog(mailer: Mailer, email: OutgoingEmail): Promise<void> {
    try {
        await mailer.send(email);
    } catch (cause) {
        console.error(
            JSON.stringify({
                level: 'error',
                event: 'pass_email_failed',
                subject: email.subject,
                error: String(cause)
            })
        );
    }
}
