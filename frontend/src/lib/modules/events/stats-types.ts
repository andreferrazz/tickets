import type { OrderStatus, PixKeyType } from '$lib/types';
import type { OrganizationRow } from '$lib/modules/organizations/types';
import type { EventRow, ExtraItemRow, TicketBatchRow, TicketTypeRow } from './types';

/** A paid order's money columns, as the fee rule needs them. */
export interface PaidOrderRow {
    total_cents: number;
    payment_method: string | null;
    card_installments: number | null;
    platform_fee_cents: number | null;
}

export interface PassTotalsRow {
    issued: number;
    checked_in: number;
}

export interface ItemRevenueRow {
    item_id: string;
    revenue_cents: number;
}

export interface RecentOrderRow {
    id: string;
    buyer_email: string;
    status: OrderStatus;
    total_cents: number;
    paid_at: Date | null;
    inserted_at: Date;
    item_count: number;
}

export interface ItemBuyerRow {
    name: string | null;
    tax_id: string | null;
    email: string;
    quantity: number;
}

export type BuyersKind = 'ticket' | 'extra';

export interface BuyersTarget {
    kind: BuyersKind;
    id: string;
}

export interface StatsTotals {
    ordersPaid: number;
    ordersPending: number;
    revenueCents: number;
    feesCents: number;
    availableToWithdrawCents: number;
    lastPayoutAt: Date | null;
    ticketsSold: number;
    ticketsCapacity: number;
    extrasSold: number;
    passesIssued: number;
    passesCheckedIn: number;
}

export interface TicketTypeStatsView {
    ticketType: TicketTypeRow;
    batches: TicketBatchRow[];
    revenueCents: number;
}

export interface ExtraStatsView {
    extra: ExtraItemRow;
    sectionTitle: string;
    revenueCents: number;
}

/** Everything the dashboard shows, before the mapper flattens it. */
export interface EventStatsView {
    event: EventRow;
    organization: OrganizationRow;
    totals: StatsTotals;
    ticketTypes: TicketTypeStatsView[];
    extras: ExtraStatsView[];
    recentOrders: RecentOrderRow[];
    canWithdraw: boolean;
}

export interface BatchStatsDto {
    id: string;
    sequence: number;
    label: string;
    sold: number;
    capacity: number;
    priceCents: number;
    closedAt: string | null;
}

export interface TicketTypeStatsDto {
    id: string;
    name: string;
    sold: number;
    capacity: number;
    revenueCents: number;
    batches: BatchStatsDto[];
}

export interface ExtraStatsDto {
    id: string;
    name: string;
    sectionTitle: string;
    sold: number;
    capacity: number | null;
    revenueCents: number;
}

export interface RecentOrderDto {
    id: string;
    buyerEmail: string;
    status: OrderStatus;
    totalCents: number;
    paidAt: string | null;
    createdAt: string;
    itemCount: number;
}

export interface StatsTotalsDto {
    ordersPaid: number;
    ordersPending: number;
    revenueCents: number;
    grossRevenueCents: number;
    feesCents: number;
    netRevenueCents: number;
    availableToWithdrawCents: number;
    lastPayoutAt: string | null;
    ticketsSold: number;
    ticketsCapacity: number;
    extrasSold: number;
    passesIssued: number;
    passesCheckedIn: number;
}

/** The wire shape of Phoenix's `stats_json/1`, in camelCase. */
export interface EventStatsDto {
    eventId: string;
    totals: StatsTotalsDto;
    ticketTypes: TicketTypeStatsDto[];
    extras: ExtraStatsDto[];
    recentOrders: RecentOrderDto[];
    canWithdraw: boolean;
    organization: { id: string; pixKey: string | null; pixKeyType: PixKeyType | null };
}

export interface ItemBuyerDto {
    name: string | null;
    taxId: string | null;
    email: string;
    quantity: number;
}
