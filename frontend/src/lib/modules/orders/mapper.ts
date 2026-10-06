import { renderQrPng } from '$lib/integrations/qr-code';
import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/utils/datetime';
import type { OrderDto, OrderItemDto, OrderItemRow, OrderRow, PassDto, PassRow } from './types';

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

let orderMapper: OrderMapper | null = null;
