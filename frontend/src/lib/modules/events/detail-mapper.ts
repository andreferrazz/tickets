import { toIso8601UtcOrNull } from '$lib/utils/datetime';
import type { EventMapper } from './mapper';
import type {
    EventDetailDto,
    EventDetailRows,
    EventRow,
    ExtraItemDto,
    ExtraItemRow,
    ExtraSectionDto,
    ExtraSectionRow,
    TicketBatchDto,
    TicketBatchRow,
    TicketTypeDto,
    TicketTypeRow
} from './types';

/**
 * Assembles an event and its child rows into the shape the event page renders.
 *
 * This is the wire contract Phoenix's `event_detail_json/1` produces, in
 * camelCase: same nesting, same `active_batch` resolution, same `Lote N` labels.
 * Both are still in use, so a change here belongs in
 * `backend/lib/backend_web/controllers/event_controller.ex` too.
 *
 * @example
 * const dto = eventDetailMapper.toDto(eventRow, childRows);
 */
export interface EventDetailMapper {
    toDto(event: EventRow, rows: EventDetailRows): EventDetailDto;
}

export function getEventDetailMapper(mapper: EventMapper): EventDetailMapper {
    eventDetailMapper ??= {
        toDto(event: EventRow, rows: EventDetailRows): EventDetailDto {
            return {
                ...mapper.toDto(event),
                ticketTypes: rows.ticketTypes.map((type) => toTicketTypeDto(type, rows.batches)),
                extraSections: rows.sections.map((section) =>
                    toExtraSectionDto(section, rows.extras)
                )
            };
        }
    };

    return eventDetailMapper;
}

let eventDetailMapper: EventDetailMapper | null = null;

function toTicketTypeDto(type: TicketTypeRow, allBatches: TicketBatchRow[]): TicketTypeDto {
    const batches = allBatches.filter((batch) => batch.ticket_type_id === type.id).map(toBatchDto);

    return {
        id: type.id,
        eventId: type.event_id,
        name: type.name,
        description: type.description,
        salesStart: toIso8601UtcOrNull(type.sales_start),
        salesEnd: toIso8601UtcOrNull(type.sales_end),
        // The batches arrive in sequence order, so the first still-open one is
        // the one on sale.
        activeBatch: batches.find((batch) => batch.closedAt === null) ?? null,
        batches
    };
}

function toBatchDto(batch: TicketBatchRow): TicketBatchDto {
    return {
        id: batch.id,
        ticketTypeId: batch.ticket_type_id,
        sequence: batch.sequence,
        label: `Lote ${batch.sequence}`,
        priceCents: batch.price_cents,
        quantityTotal: batch.quantity_total,
        quantitySold: batch.quantity_sold,
        closedAt: toIso8601UtcOrNull(batch.closed_at)
    };
}

function toExtraSectionDto(section: ExtraSectionRow, allExtras: ExtraItemRow[]): ExtraSectionDto {
    return {
        id: section.id,
        eventId: section.event_id,
        title: section.title,
        description: section.description,
        position: section.position,
        extras: allExtras.filter((extra) => extra.section_id === section.id).map(toExtraItemDto)
    };
}

function toExtraItemDto(extra: ExtraItemRow): ExtraItemDto {
    return {
        id: extra.id,
        eventId: extra.event_id,
        sectionId: extra.section_id,
        name: extra.name,
        description: extra.description,
        priceCents: extra.price_cents,
        quantityTotal: extra.quantity_total,
        quantitySold: extra.quantity_sold,
        showRemaining: extra.show_remaining,
        limitToTicketCount: extra.limit_to_ticket_count
    };
}
