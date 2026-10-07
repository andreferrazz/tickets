import { feeCents } from '$lib/integrations/abacate-pay/fees';
import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { EventDetailService } from './detail-service';
import type { ManagedEventFinder } from './managed-event';
import type { EventStatsRepository } from './stats-repository';
import type {
    BuyersTarget,
    EventStatsView,
    ExtraStatsView,
    ItemBuyerRow,
    ItemRevenueRow,
    PaidOrderRow,
    StatsTotals,
    TicketTypeStatsView
} from './stats-types';
import type { EventDetailRows, EventRow } from './types';

const RECENT_ORDERS = 10;

/**
 * The creator dashboard figures, as `Backend.Events.event_stats/2` computed
 * them. Null answers mean "not yours or not there", never distinguished.
 */
export interface EventStatsService {
    getStats(user: SessionUser, eventId: string): Promise<EventStatsView | null>;
    /** Buyers of one item on `eventId`; null when the event is not managed or the item is not on it. */
    listBuyers(
        user: SessionUser,
        eventId: string,
        target: BuyersTarget
    ): Promise<ItemBuyerRow[] | null>;
}

export interface EventStatsServiceDeps {
    managedEvents: ManagedEventFinder;
    details: EventDetailService;
    stats: EventStatsRepository;
    organizations: OrganizationService;
}

export function getEventStatsService(deps: EventStatsServiceDeps): EventStatsService {
    return {
        async getStats(user, eventId) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return null;
            const [organization, rows, totals, canWithdraw] = await Promise.all([
                deps.organizations.findById(event.organization_id),
                deps.details.loadRows(event.id),
                loadTotals(deps.stats, event),
                deps.organizations.isLeader(user, event.organization_id)
            ]);
            if (!organization) return null;
            const [ticketRevenue, extraRevenue, recentOrders] = await Promise.all([
                deps.stats.paidRevenueByItem(event.id, 'ticket'),
                deps.stats.paidRevenueByItem(event.id, 'extra'),
                deps.stats.listRecentOrders(event.id, RECENT_ORDERS)
            ]);
            return {
                event,
                organization,
                totals: { ...totals, ...stockTotals(rows) },
                ticketTypes: ticketTypeStats(rows, byItem(ticketRevenue)),
                extras: extraStats(rows, byItem(extraRevenue)),
                recentOrders,
                canWithdraw
            };
        },

        async listBuyers(user, eventId, target) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return null;
            const rows = await deps.details.loadRows(event.id);
            const onEvent = target.kind === 'ticket' ? rows.ticketTypes : rows.extras;
            if (!onEvent.some((item) => item.id === target.id)) return null;
            return deps.stats.listItemBuyers(target.kind, target.id);
        }
    };
}

type MoneyTotals = Omit<StatsTotals, 'ticketsSold' | 'ticketsCapacity' | 'extrasSold'>;

async function loadTotals(stats: EventStatsRepository, event: EventRow): Promise<MoneyTotals> {
    const [pending, paid, passes, deducted, lastPayoutAt] = await Promise.all([
        stats.countPendingOrders(event.id),
        stats.listPaidOrders(event.id),
        stats.passTotals(event.id),
        stats.deductedPayoutCents(event.id),
        stats.lastPayoutAt(event.id)
    ]);
    const revenueCents = paid.reduce((sum, order) => sum + order.total_cents, 0);
    const feesCentsTotal = paid.reduce((sum, order) => sum + orderFeeCents(order), 0);
    return {
        ordersPaid: paid.length,
        ordersPending: pending,
        revenueCents,
        feesCents: feesCentsTotal,
        availableToWithdrawCents: Math.max(0, revenueCents - feesCentsTotal - deducted),
        lastPayoutAt,
        passesIssued: passes.issued,
        passesCheckedIn: passes.checked_in
    };
}

// Prefer the platform fee Abacate reported on checkout.completed: it is what
// they actually kept. A free order never touched the processor, so it has no
// fee. Legacy paid rows without a reported fee fall back to the fee table.
function orderFeeCents(order: PaidOrderRow): number {
    if (order.platform_fee_cents !== null && order.platform_fee_cents >= 0) {
        return order.platform_fee_cents;
    }
    if (order.total_cents === 0) return 0;
    return feeCents(order.total_cents, order.payment_method, order.card_installments);
}

function stockTotals(
    rows: EventDetailRows
): Pick<StatsTotals, 'ticketsSold' | 'ticketsCapacity' | 'extrasSold'> {
    return {
        ticketsSold: rows.batches.reduce((sum, batch) => sum + batch.quantity_sold, 0),
        ticketsCapacity: rows.batches.reduce((sum, batch) => sum + batch.quantity_total, 0),
        extrasSold: rows.extras.reduce((sum, extra) => sum + extra.quantity_sold, 0)
    };
}

function byItem(rows: ItemRevenueRow[]): Map<string, number> {
    return new Map(rows.map((row) => [row.item_id, row.revenue_cents]));
}

function ticketTypeStats(
    rows: EventDetailRows,
    revenue: Map<string, number>
): TicketTypeStatsView[] {
    return rows.ticketTypes.map((ticketType) => ({
        ticketType,
        batches: rows.batches.filter((batch) => batch.ticket_type_id === ticketType.id),
        revenueCents: revenue.get(ticketType.id) ?? 0
    }));
}

function extraStats(rows: EventDetailRows, revenue: Map<string, number>): ExtraStatsView[] {
    return rows.sections.flatMap((section) =>
        rows.extras
            .filter((extra) => extra.section_id === section.id)
            .map((extra) => ({
                extra,
                sectionTitle: section.title,
                revenueCents: revenue.get(extra.id) ?? 0
            }))
    );
}
