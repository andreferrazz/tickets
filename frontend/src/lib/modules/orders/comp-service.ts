import { normalizeEmail } from '$lib/modules/accounts/auth-service';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { ManagedEventFinder } from '$lib/modules/events/managed-event';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isEmailAddress } from '$lib/utils/email';
import type { CartResolver } from './cart-resolution';
import type { OrderOutcome, ReservableLine } from './checkout-types';
import type { FreeOrderSettlement } from './free-order';
import type { StockReservation } from './stock-reservation';

export interface CompRecipient {
    email: string;
    quantity: number;
}

export type CompRecipientFailure =
    'invalid_email' | 'invalid_quantity' | 'out_of_stock' | 'invalid_item';

export interface CompSummary {
    /** Addresses whose tickets were issued and mailed. */
    sent: string[];
    /** Recipients that were skipped, each with why. */
    failed: { email: string; error: CompRecipientFailure }[];
}

export interface CompRequest {
    eventId: string;
    ticketTypeId: string;
    recipients: CompRecipient[];
    origin: string;
}

export type CompFailure = 'not_found' | 'event_not_available' | 'no_recipients';

const EMAIL_MAX = 255;

/**
 * Free ("comp") tickets from an event's managers to a guest list, as
 * `Backend.Orders.create_comp_order/4` issued them: each recipient gets a paid
 * order of total zero that still takes batch stock, owns the passes, and is
 * mailed the QR codes. No account is needed beforehand; one is created for an
 * address that has none. Recipients stand alone, so a bad address or a
 * sold-out batch skips that guest and not the list.
 *
 * @example
 * const result = await compTickets.issue(user, { eventId, ticketTypeId, recipients, origin });
 * if (result.ok) result.value.sent; // ['guest@example.com']
 */
export interface CompTicketIssuer {
    issue(
        manager: SessionUser,
        request: CompRequest
    ): Promise<OrderOutcome<CompSummary, CompFailure>>;
}

export interface CompTicketIssuerDeps {
    managedEvents: ManagedEventFinder;
    users: UserRepository;
    cart: CartResolver;
    stock: StockReservation;
    freeOrders: FreeOrderSettlement;
}

export function getCompTicketIssuer(deps: CompTicketIssuerDeps): CompTicketIssuer {
    const recipientId = async (email: string): Promise<string> => {
        const existing = await deps.users.findByEmail(email);
        return (existing ?? (await deps.users.insertBuyer(email))).id;
    };

    const freeLines = async (request: CompRequest, quantity: number) => {
        const cart = [{ itemType: 'ticket' as const, itemId: request.ticketTypeId, quantity }];
        const resolved = await deps.cart.resolve(request.eventId, cart);
        if (!resolved.ok) return resolved;
        // Whatever the batch costs, a comp is free: the order takes the free path.
        const lines: ReservableLine[] = resolved.value.map((l) => ({ ...l, priceCents: 0 }));
        return { ok: true as const, value: lines };
    };

    const issueTo = async (
        request: CompRequest,
        recipient: CompRecipient
    ): Promise<CompRecipientFailure | null> => {
        const email = normalizeEmail(recipient.email);
        if (!isEmailAddress(email) || email.length > EMAIL_MAX) return 'invalid_email';
        if (!Number.isInteger(recipient.quantity) || recipient.quantity <= 0)
            return 'invalid_quantity';
        const lines = await freeLines(request, recipient.quantity);
        if (!lines.ok) return lines.failure === 'out_of_stock' ? 'out_of_stock' : 'invalid_item';
        const reserved = await deps.stock.reserve(
            await recipientId(email),
            request.eventId,
            lines.value
        );
        if (!reserved.ok) return 'out_of_stock';
        await deps.freeOrders.settle(reserved.value, request.origin);
        return null;
    };

    return {
        async issue(manager, request) {
            const event = await deps.managedEvents.find(manager, request.eventId);
            if (!event) return { ok: false, failure: 'not_found' };
            if (event.status !== 'published') return { ok: false, failure: 'event_not_available' };
            if (request.recipients.length === 0) return { ok: false, failure: 'no_recipients' };
            const summary: CompSummary = { sent: [], failed: [] };
            // One at a time: the guests share one batch, and its stock is given
            // out in the order the list was written.
            for (const recipient of request.recipients) {
                const error = await issueTo({ ...request, eventId: event.id }, recipient);
                if (error) summary.failed.push({ email: recipient.email, error });
                else summary.sent.push(normalizeEmail(recipient.email));
            }
            return { ok: true, value: summary };
        }
    };
}
