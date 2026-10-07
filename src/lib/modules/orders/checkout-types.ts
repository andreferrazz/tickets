export type CartItemType = 'ticket' | 'extra';

/** One line of a cart as the buyer submitted it; nothing in it is trusted yet. */
export interface CartLine {
    itemType: CartItemType;
    itemId: string;
    quantity: number;
}

/** A cart line resolved against the database: what the order will record and reserve. */
export interface ReservableLine {
    type: CartItemType;
    itemId: string;
    /** The batch on sale when the cart was resolved; null on extras. */
    batchId: string | null;
    name: string;
    priceCents: number;
    /** The Abacate `prod_*` id; null on free lines, which are never billed. */
    productId: string | null;
    quantity: number;
    limitToTicketCount: boolean;
}

export type CartFailure = 'no_items' | 'invalid_item' | 'out_of_stock' | 'extra_exceeds_tickets';

export type PlacementFailure =
    | CartFailure
    | 'event_not_found'
    | 'event_not_available'
    | 'invalid_payment_method'
    | 'profile_incomplete'
    | 'missing_product'
    | 'abacate_unavailable';

export type CancellationFailure =
    'not_found' | 'not_cancellable' | 'already_paid' | 'payment_check_failed';

/** `itemName` says which line a stock or cart failure is about, when one line is to blame. */
export type OrderOutcome<Value, Failure> =
    { ok: true; value: Value } | { ok: false; failure: Failure; itemName?: string };

export interface PlacedOrder {
    id: string;
    /** Where the buyer pays; null for a free order, which is already paid. */
    paymentUrl: string | null;
}
