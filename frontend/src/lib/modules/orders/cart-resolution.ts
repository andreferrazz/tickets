import { isUuid } from '$lib/utils/uuid';
import type { CartFailure, CartLine, OrderOutcome, ReservableLine } from './checkout-types';
import type { ReservationRepository } from './reservation-repository';

type Resolved = OrderOutcome<ReservableLine, CartFailure>;

/**
 * Turns the cart a buyer submitted into lines an order can record: every item
 * must belong to the event, be on sale and have the stock asked for. Prices
 * come from the database, never from the form.
 *
 * @example
 * const cart = await cartResolver.resolve(event.id, [{ itemType: 'ticket', itemId, quantity: 2 }]);
 * if (!cart.ok) return cart; // { failure: 'out_of_stock', itemName: 'Pista' }
 */
export interface CartResolver {
    resolve(
        eventId: string,
        cart: CartLine[]
    ): Promise<OrderOutcome<ReservableLine[], CartFailure>>;
}

export function getCartResolver(reservations: ReservationRepository): CartResolver {
    const resolveTicket = async (eventId: string, line: CartLine): Promise<Resolved> => {
        const ticket = await reservations.findSellableTicket(line.itemId);
        if (!ticket || ticket.event_id !== eventId) return { ok: false, failure: 'invalid_item' };
        if (!ticket.batch_id || (ticket.remaining ?? 0) < line.quantity)
            return { ok: false, failure: 'out_of_stock', itemName: ticket.name };
        return {
            ok: true,
            value: {
                type: 'ticket',
                itemId: ticket.ticket_type_id,
                batchId: ticket.batch_id,
                name: ticket.name,
                priceCents: ticket.price_cents ?? 0,
                productId: ticket.abacate_product_id,
                quantity: line.quantity,
                limitToTicketCount: false
            }
        };
    };

    const resolveExtra = async (eventId: string, line: CartLine): Promise<Resolved> => {
        const extra = await reservations.findSellableExtra(line.itemId);
        if (!extra || extra.event_id !== eventId) return { ok: false, failure: 'invalid_item' };
        if (extra.remaining !== null && extra.remaining < line.quantity)
            return { ok: false, failure: 'out_of_stock', itemName: extra.name };
        return {
            ok: true,
            value: {
                type: 'extra',
                itemId: extra.id,
                batchId: null,
                name: extra.name,
                priceCents: extra.price_cents,
                productId: extra.abacate_product_id,
                quantity: line.quantity,
                limitToTicketCount: extra.limit_to_ticket_count
            }
        };
    };

    const resolveLine = (eventId: string, line: CartLine): Promise<Resolved> => {
        const wellFormed =
            isUuid(line.itemId) && Number.isInteger(line.quantity) && line.quantity > 0;
        if (!wellFormed) return Promise.resolve({ ok: false, failure: 'invalid_item' });
        return line.itemType === 'ticket'
            ? resolveTicket(eventId, line)
            : resolveExtra(eventId, line);
    };

    return {
        async resolve(eventId, cart) {
            if (cart.length === 0) return { ok: false, failure: 'no_items' };
            const lines: ReservableLine[] = [];
            for (const line of cart) {
                const resolved = await resolveLine(eventId, line);
                if (!resolved.ok) return resolved;
                lines.push(resolved.value);
            }
            const overCap = extraOverTicketCount(lines);
            if (overCap)
                return { ok: false, failure: 'extra_exceeds_tickets', itemName: overCap.name };
            return { ok: true, value: lines };
        }
    };
}

// An extra flagged `limit_to_ticket_count` sells at most one per ticket in the
// same order, across every ticket type.
function extraOverTicketCount(lines: ReservableLine[]): ReservableLine | null {
    const tickets = lines
        .filter((line) => line.type === 'ticket')
        .reduce((sum, line) => sum + line.quantity, 0);
    return lines.find((line) => line.limitToTicketCount && line.quantity > tickets) ?? null;
}
