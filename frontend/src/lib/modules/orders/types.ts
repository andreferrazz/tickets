import type { OrderStatus, PaymentMethod } from '$lib/types';

export type PassKind = 'ticket' | 'extra';

/** A row of `orders` joined to its event's title, as Postgres returns it. */
export interface OrderRow {
    id: string;
    user_id: string;
    event_id: string;
    event_title: string;
    status: OrderStatus;
    total_cents: number;
    abacate_payment_url: string | null;
    paid_at: Date | null;
    inserted_at: Date;
}

export interface OrderItemRow {
    id: string;
    order_id: string;
    item_type: PassKind;
    item_id: string;
    item_name: string;
    quantity: number;
    unit_price_cents: number;
}

export interface PassRow {
    id: string;
    order_id: string;
    kind: PassKind;
    item_name: string;
    token: string;
    checked_in_at: Date | null;
}

/** An order with the rows that belong to it, as the service hands it to the mapper. */
export interface OrderWithItems {
    order: OrderRow;
    items: OrderItemRow[];
}

export interface OrderDetail extends OrderWithItems {
    passes: PassRow[];
}

export interface OrderItemDto {
    id: string;
    itemType: PassKind;
    itemId: string;
    itemName: string;
    quantity: number;
    unitPriceCents: number;
}

/** The wire shape of Phoenix's `order_json/1`, in camelCase. */
export interface OrderDto {
    id: string;
    userId: string;
    eventId: string;
    eventTitle: string;
    status: OrderStatus;
    totalCents: number;
    abacatePaymentUrl: string | null;
    paidAt: string | null;
    createdAt: string;
    items: OrderItemDto[];
}

/** A row of `orders` joined to its buyer, for the people who manage the event. */
export interface EventOrderRow {
    id: string;
    buyer_name: string | null;
    buyer_email: string;
    buyer_phone: string | null;
    status: OrderStatus;
    total_cents: number;
    payment_method: PaymentMethod | null;
    paid_at: Date | null;
    inserted_at: Date;
}

export interface ValidatedCountRow {
    order_id: string;
    validated: number;
}

export interface EventOrderView {
    order: EventOrderRow;
    items: OrderItemRow[];
    /** Ticket passes already scanned, shown against the ticket count. */
    validatedCount: number;
}

export interface EventOrderLineDto {
    name: string;
    quantity: number;
    unitPriceCents: number;
}

/** The wire shape of Phoenix's `event_order_json/1`, in camelCase. */
export interface EventOrderDto {
    id: string;
    buyerName: string | null;
    buyerEmail: string;
    buyerPhone: string | null;
    status: OrderStatus;
    totalCents: number;
    paymentMethod: PaymentMethod | null;
    paidAt: string | null;
    createdAt: string;
    tickets: EventOrderLineDto[];
    extras: EventOrderLineDto[];
    validatedCount: number;
}

/** The wire shape of Phoenix's `pass_json/1` on the order endpoint, QR included. */
export interface PassDto {
    id: string;
    kind: PassKind;
    itemName: string;
    token: string;
    checkedInAt: string | null;
    qrPngBase64: string;
}
