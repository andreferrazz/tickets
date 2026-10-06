import type { OrderStatus } from '$lib/types';

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

/** The wire shape of Phoenix's `pass_json/1` on the order endpoint, QR included. */
export interface PassDto {
    id: string;
    kind: PassKind;
    itemName: string;
    token: string;
    checkedInAt: string | null;
    qrPngBase64: string;
}
