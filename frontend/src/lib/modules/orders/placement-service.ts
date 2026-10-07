import { describeAbacateFailure } from '$lib/integrations/abacate-pay/errors';
import type { AbacatePayGateway, CheckoutItem } from '$lib/integrations/abacate-pay/gateway';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { UserRow } from '$lib/modules/accounts/types';
import type { EventRepository } from '$lib/modules/events/repository';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { PaymentMethod } from '$lib/types';
import { isUuid } from '$lib/utils/uuid';
import type { CartResolver } from './cart-resolution';
import type {
    CartLine,
    OrderOutcome,
    PlacedOrder,
    PlacementFailure,
    ReservableLine
} from './checkout-types';
import type { FreeOrderSettlement } from './free-order';
import type { AttachedCheckout, OrderStateRepository } from './order-state-repository';
import type { StockReservation } from './stock-reservation';

export interface PlacementRequest {
    eventId: string;
    cart: CartLine[];
    /** Ignored for a free cart; required as soon as there is something to charge. */
    paymentMethod: PaymentMethod | null;
    /** The site's own origin, for the URLs Abacate Pay sends the buyer back to. */
    origin: string;
}

type Placed = OrderOutcome<PlacedOrder, PlacementFailure>;

/**
 * Placing an order, as `Backend.Orders.create_order/4` did: resolve the cart,
 * reserve its stock with the order in one transaction, then either settle it
 * on the spot (nothing to charge) or open a checkout at Abacate Pay. The
 * checkout call runs outside any transaction, and an order whose checkout
 * cannot be opened gives its stock back.
 *
 * @example
 * const placed = await orderPlacement.place(user, { eventId, cart, paymentMethod: 'PIX', origin });
 * if (placed.ok) redirect(303, placed.value.paymentUrl ?? `/orders/${placed.value.id}`);
 */
export interface OrderPlacement {
    place(buyer: SessionUser, request: PlacementRequest): Promise<Placed>;
}

export interface OrderPlacementDeps {
    events: EventRepository;
    users: UserRepository;
    cart: CartResolver;
    stock: StockReservation;
    freeOrders: FreeOrderSettlement;
    orderStates: OrderStateRepository;
    abacatePay: AbacatePayGateway;
}

interface Charge {
    lines: ReservableLine[];
    totalCents: number;
    method: PaymentMethod;
    payer: UserRow;
    origin: string;
}

const failed = (failure: PlacementFailure, itemName?: string): Placed =>
    itemName ? { ok: false, failure, itemName } : { ok: false, failure };

export function getOrderPlacement(deps: OrderPlacementDeps): OrderPlacement {
    const placeFree = async (
        buyer: SessionUser,
        request: PlacementRequest,
        lines: ReservableLine[]
    ) => {
        const reserved = await deps.stock.reserve(buyer.id, request.eventId, lines);
        if (!reserved.ok) return reserved;
        await deps.freeOrders.settle(reserved.value, request.origin);
        return { ok: true as const, value: { id: reserved.value, paymentUrl: null } };
    };

    const placeCharged = async (eventId: string, charge: Charge): Promise<Placed> => {
        const refusal = chargeRefusal(charge);
        if (refusal) return refusal;
        const reserved = await deps.stock.reserve(charge.payer.id, eventId, charge.lines);
        if (!reserved.ok) return reserved;
        const checkout = await openOrRelease(deps, reserved.value, charge);
        if (!checkout) return failed('abacate_unavailable');
        await deps.orderStates.attachCheckout(reserved.value, checkout);
        return { ok: true, value: { id: reserved.value, paymentUrl: checkout.url } };
    };

    return {
        async place(buyer, request) {
            const event = isUuid(request.eventId)
                ? await deps.events.findEventById(request.eventId)
                : null;
            if (!event) return failed('event_not_found');
            if (event.status !== 'published') return failed('event_not_available');
            const cart = await deps.cart.resolve(event.id, request.cart);
            if (!cart.ok) return cart;
            const totalCents = cart.value.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
            if (totalCents === 0) return placeFree(buyer, request, cart.value);
            if (!request.paymentMethod) return failed('invalid_payment_method');
            const payer = await deps.users.findById(buyer.id);
            if (!payer) return failed('profile_incomplete');
            const { paymentMethod: method, origin } = request;
            return placeCharged(event.id, { lines: cart.value, totalCents, method, payer, origin });
        }
    };
}

// What can be known to fail before any stock is taken. A priced line with no
// product cannot be billed; a boleto is issued to a name and a tax id.
function chargeRefusal(charge: Charge): Placed | null {
    const unbillable = charge.lines.find((line) => line.priceCents > 0 && !line.productId);
    if (unbillable) return failed('missing_product', unbillable.name);
    const anonymous = !charge.payer.name || !charge.payer.tax_id;
    return charge.method === 'BOLETO' && anonymous ? failed('profile_incomplete') : null;
}

// Null when Abacate Pay refused or could not be reached; the order is then
// expired and its stock released, as `finalize_order/6` did.
async function openOrRelease(
    deps: OrderPlacementDeps,
    orderId: string,
    charge: Charge
): Promise<AttachedCheckout | null> {
    try {
        return await openCheckout(deps.abacatePay, orderId, charge);
    } catch (cause) {
        await deps.stock.release({
            orderId,
            from: ['pending'],
            to: 'expired',
            deletePasses: false
        });
        const event = 'abacate_checkout_create_failed';
        console.warn(JSON.stringify({ event, orderId, ...describeAbacateFailure(cause) }));
        return null;
    }
}

// Boleto goes through the transparent endpoint (a total and the payer's
// identity, no product items); PIX and CARD use the hosted checkout restricted
// to the one method the buyer chose.
async function openCheckout(
    abacatePay: AbacatePayGateway,
    orderId: string,
    charge: Charge
): Promise<AttachedCheckout> {
    const { payer, method, totalCents, origin } = charge;
    if (method === 'BOLETO') {
        const boleto = { totalCents, name: payer.name ?? '', taxId: payer.tax_id ?? '' };
        const created = await abacatePay.createBoleto(boleto);
        return { ...created, paymentMethod: method };
    }
    const created = await abacatePay.createCheckout({
        items: billableItems(charge.lines),
        returnUrl: `${origin}/orders`,
        completionUrl: `${origin}/orders/${orderId}`,
        customerId: payer.abacate_customer_id,
        totalCents,
        methods: [method]
    });
    return { ...created, paymentMethod: method, expiresAt: null };
}

// Free lines stay on the order but off the invoice: Abacate Pay rejects
// zero-priced items and there is nothing to bill for them.
function billableItems(lines: ReservableLine[]): CheckoutItem[] {
    return lines
        .filter((line) => line.priceCents > 0 && line.productId)
        .map((line) => ({ id: line.productId as string, quantity: line.quantity }));
}
