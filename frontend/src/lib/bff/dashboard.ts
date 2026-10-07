import { logLoadFailure } from './load-failure';
import type { EventStatsMapper } from '$lib/modules/events/stats-mapper';
import type { EventStatsService } from '$lib/modules/events/stats-service';
import type { BuyersTarget, EventStatsDto, ItemBuyerDto } from '$lib/modules/events/stats-types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface BuyersData {
    target: BuyersTarget & { name: string };
    rows: ItemBuyerDto[];
}

export interface DashboardData {
    /** Null when the event does not exist or `user` may not manage it. */
    stats: EventStatsDto | null;
    /** The buyers list the page was asked to open, when it names an item on the event. */
    buyers: BuyersData | null;
    loadFailed: boolean;
}

export interface DashboardBff {
    show(user: SessionUser, eventId: string, buyers: BuyersTarget | null): Promise<DashboardData>;
}

export function getDashboardBff(
    service: EventStatsService,
    mapper: EventStatsMapper
): DashboardBff {
    return {
        async show(user, eventId, target) {
            try {
                const view = await service.getStats(user, eventId);
                if (!view) return { stats: null, buyers: null, loadFailed: false };
                const stats = mapper.toDto(view);
                const buyers = target
                    ? await loadBuyers(service, mapper, user, stats, target)
                    : null;
                return { stats, buyers, loadFailed: false };
            } catch (cause) {
                logLoadFailure('dashboard_load_failed', { eventId }, cause);
                return { stats: null, buyers: null, loadFailed: true };
            }
        }
    };
}

async function loadBuyers(
    service: EventStatsService,
    mapper: EventStatsMapper,
    user: SessionUser,
    stats: EventStatsDto,
    target: BuyersTarget
): Promise<BuyersData | null> {
    const items = target.kind === 'ticket' ? stats.ticketTypes : stats.extras;
    const item = items.find((candidate) => candidate.id === target.id);
    const rows = await service.listBuyers(user, stats.eventId, target);
    if (!item || !rows) return null;
    return {
        target: { ...target, name: item.name },
        rows: rows.map((row) => mapper.toBuyerDto(row))
    };
}
