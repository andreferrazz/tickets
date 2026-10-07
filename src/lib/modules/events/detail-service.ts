import type { EventDetailRepository } from './detail-repository';
import type { EventDetailRows } from './types';

/**
 * Loads what one event sells. Split from {@link EventService}, which answers who
 * may see an event — this only runs once that question is settled.
 *
 * @example
 * const rows = await detailService.loadRows(event.id);
 */
export interface EventDetailService {
    loadRows(eventId: string): Promise<EventDetailRows>;
}

export function getEventDetailService(repository: EventDetailRepository): EventDetailService {
    return {
        async loadRows(eventId: string): Promise<EventDetailRows> {
            // Independent queries against the same pool: serialising them would
            // add four round trips to the page's time to first byte.
            const [ticketTypes, batches, sections, extras] = await Promise.all([
                repository.listTicketTypes(eventId),
                repository.listTicketBatches(eventId),
                repository.listExtraSections(eventId),
                repository.listExtraItems(eventId)
            ]);

            return { ticketTypes, batches, sections, extras };
        }
    };
}
