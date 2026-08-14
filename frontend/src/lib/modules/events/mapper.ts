import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/utils/datetime';
import type { EventDto, EventRow } from './types';

/**
 * Turns a database row of the `events` table into the wire shape handlers and
 * pages consume. Owns every snake_case -> camelCase and `Date` -> ISO-8601
 * decision for events, so callers never touch row columns directly.
 *
 * @example
 * const mapper = getEventMapper();
 * const events = rows.map((row) => mapper.toDto(row));
 */
export interface EventMapper {
    toDto(row: EventRow): EventDto;
}

export function getEventMapper(): EventMapper {
    eventMapper ??= {
        toDto(row: EventRow): EventDto {
            return {
                id: row.id,
                organizationId: row.organization_id,
                createdById: row.created_by_id,
                title: row.title,
                description: row.description,
                ticketsDescription: row.tickets_description,
                location: row.location,
                startsAt: toIso8601Utc(row.starts_at),
                endsAt: toIso8601UtcOrNull(row.ends_at),
                coverImageUrl: row.cover_image_url,
                status: row.status,
                createdAt: toIso8601Utc(row.inserted_at),
                updatedAt: toIso8601Utc(row.updated_at)
            };
        }
    };

    return eventMapper;
}

let eventMapper: EventMapper | null = null;
