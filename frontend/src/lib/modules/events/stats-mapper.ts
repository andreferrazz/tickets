import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/utils/datetime';
import type {
    BatchStatsDto,
    EventStatsDto,
    EventStatsView,
    ExtraStatsDto,
    ExtraStatsView,
    ItemBuyerDto,
    ItemBuyerRow,
    RecentOrderDto,
    RecentOrderRow,
    StatsTotalsDto,
    TicketTypeStatsDto,
    TicketTypeStatsView
} from './stats-types';
import type { TicketBatchRow } from './types';

/**
 * Flattens the dashboard view into the shape Phoenix's `stats_json/1` sent,
 * in camelCase, batch labels included.
 */
export interface EventStatsMapper {
    toDto(view: EventStatsView): EventStatsDto;
    toBuyerDto(row: ItemBuyerRow): ItemBuyerDto;
}

export function getEventStatsMapper(): EventStatsMapper {
    return {
        toDto(view) {
            return {
                eventId: view.event.id,
                totals: totalsDto(view),
                ticketTypes: view.ticketTypes.map(ticketTypeDto),
                extras: view.extras.map(extraDto),
                recentOrders: view.recentOrders.map(recentOrderDto),
                canWithdraw: view.canWithdraw,
                organization: {
                    id: view.organization.id,
                    pixKey: view.organization.pix_key,
                    pixKeyType: view.organization.pix_key_type
                }
            };
        },
        toBuyerDto(row) {
            return { name: row.name, taxId: row.tax_id, email: row.email, quantity: row.quantity };
        }
    };
}

function totalsDto({ totals }: EventStatsView): StatsTotalsDto {
    return {
        ordersPaid: totals.ordersPaid,
        ordersPending: totals.ordersPending,
        revenueCents: totals.revenueCents,
        grossRevenueCents: totals.revenueCents,
        feesCents: totals.feesCents,
        netRevenueCents: totals.revenueCents - totals.feesCents,
        availableToWithdrawCents: totals.availableToWithdrawCents,
        lastPayoutAt: toIso8601UtcOrNull(totals.lastPayoutAt),
        ticketsSold: totals.ticketsSold,
        ticketsCapacity: totals.ticketsCapacity,
        extrasSold: totals.extrasSold,
        passesIssued: totals.passesIssued,
        passesCheckedIn: totals.passesCheckedIn
    };
}

function ticketTypeDto(view: TicketTypeStatsView): TicketTypeStatsDto {
    return {
        id: view.ticketType.id,
        name: view.ticketType.name,
        sold: view.batches.reduce((sum, batch) => sum + batch.quantity_sold, 0),
        capacity: view.batches.reduce((sum, batch) => sum + batch.quantity_total, 0),
        revenueCents: view.revenueCents,
        batches: view.batches.map(batchDto)
    };
}

function batchDto(batch: TicketBatchRow): BatchStatsDto {
    return {
        id: batch.id,
        sequence: batch.sequence,
        label: `Lote ${batch.sequence}`,
        sold: batch.quantity_sold,
        capacity: batch.quantity_total,
        priceCents: batch.price_cents,
        closedAt: toIso8601UtcOrNull(batch.closed_at)
    };
}

function extraDto(view: ExtraStatsView): ExtraStatsDto {
    return {
        id: view.extra.id,
        name: view.extra.name,
        sectionTitle: view.sectionTitle,
        sold: view.extra.quantity_sold,
        capacity: view.extra.quantity_total,
        revenueCents: view.revenueCents
    };
}

function recentOrderDto(row: RecentOrderRow): RecentOrderDto {
    return {
        id: row.id,
        buyerEmail: row.buyer_email,
        status: row.status,
        totalCents: row.total_cents,
        paidAt: toIso8601UtcOrNull(row.paid_at),
        createdAt: toIso8601Utc(row.inserted_at),
        itemCount: row.item_count
    };
}
