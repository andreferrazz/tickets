import { toIso8601Utc, toIso8601UtcOrNull } from '$lib/modules/common/timestamps';
import type { Event } from '$lib/types';
import type { EventRow } from './types';

/**
 * Renders an event row in the wire shape the client already expects. This must
 * stay field-for-field identical to `EventController.event_json/1` in the
 * Phoenix app, which still serves the same events to the /scan page.
 *
 * Note `created_at` comes from the `inserted_at` column — that rename is part of
 * the contract, not an accident.
 *
 * @example
 * const json = toEventJson(row); // { id: '…', created_at: '2026-05-13T01:00:17Z', … }
 */
export function toEventJson(row: EventRow): Event {
	return {
		id: row.id,
		organization_id: row.organization_id,
		created_by_id: row.created_by_id,
		title: row.title,
		description: row.description,
		tickets_description: row.tickets_description,
		location: row.location,
		starts_at: toIso8601Utc(row.starts_at),
		ends_at: toIso8601UtcOrNull(row.ends_at),
		cover_image_url: row.cover_image_url,
		status: row.status,
		seat_selection_enabled: row.seat_selection_enabled,
		seats_per_table: row.seats_per_table,
		created_at: toIso8601Utc(row.inserted_at),
		updated_at: toIso8601Utc(row.updated_at)
	};
}
