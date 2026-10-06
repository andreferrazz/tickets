import { renderQrPng } from '$lib/integrations/qr-code';
import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/utils/datetime';
import type {
    EventOrderDto,
    EventOrderLineDto,
    EventOrderView,
    OrderDto,
    OrderItemDto,
    OrderItemRow,
    OrderRow,
    PassDto,
    PassRow
} from './types';

/**
 * Turns order, item and pass rows into the wire shapes the buyer pages render:
 * Phoenix's `order_json/1` and `pass_json/1` in camelCase. Both are still in
 * use until the order endpoints retire, so a change here belongs in
 * `backend/lib/backend_web/controllers/order_controller.ex` too.
 *
 * @example
 * const dto = orderMapper.toOrderDto(order, items);
 * const passes = await Promise.all(rows.map((row) => orderMapper.toPassDto(row)));
 */
export interface OrderMapper {
    toOrderDto(order: OrderRow, items: OrderItemRow[]): OrderDto;
    /** Async because the QR code is rendered here, as the Phoenix endpoint did. */
    toPassDto(pass: PassRow): Promise<PassDto>;
    /** Phoenix's `event_order_json/1`: lines split into tickets and extras. */
    toEventOrderDto(view: EventOrderView): EventOrderDto;
}

export function getOrderMapper(): OrderMapper {
    orderMapper ??= {
        toOrderDto(order, items) {
            return {
                id: order.id,
                userId: order.user_id,
                eventId: order.event_id,
                eventTitle: order.event_title,
                status: order.status,
                totalCents: order.total_cents,
                abacatePaymentUrl: order.abacate_payment_url,
                paidAt: toIso8601UtcOrNull(order.paid_at),
                createdAt: toIso8601Utc(order.inserted_at),
                items: items.map(toItemDto)
            };
        },

        toEventOrderDto({ order, items, validatedCount }) {
            return {
                id: order.id,
                buyerName: order.buyer_name,
                buyerEmail: order.buyer_email,
                buyerPhone: order.buyer_phone,
                status: order.status,
                totalCents: order.total_cents,
                paymentMethod: order.payment_method,
                paidAt: toIso8601UtcOrNull(order.paid_at),
                createdAt: toIso8601Utc(order.inserted_at),
                tickets: items.filter((item) => item.item_type === 'ticket').map(toLineDto),
                extras: items.filter((item) => item.item_type === 'extra').map(toLineDto),
                validatedCount
            };
        },

        async toPassDto(pass) {
            const png = await renderQrPng(pass.token);
            return {
                id: pass.id,
                kind: pass.kind,
                itemName: pass.item_name,
                token: pass.token,
                checkedInAt: toIso8601UtcOrNull(pass.checked_in_at),
                qrPngBase64: Buffer.from(png).toString('base64')
            };
        }
    };
    return orderMapper;
}

function toItemDto(item: OrderItemRow): OrderItemDto {
    return {
        id: item.id,
        itemType: item.item_type,
        itemId: item.item_id,
        itemName: item.item_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents
    };
}

function toLineDto(item: OrderItemRow): EventOrderLineDto {
    return { name: item.item_name, quantity: item.quantity, unitPriceCents: item.unit_price_cents };
}

let orderMapper: OrderMapper | null = null;
