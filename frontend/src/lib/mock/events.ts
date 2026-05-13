import type { Event, EventDetail, ExtraItem, TicketType } from '$lib/types';
import { getState } from './store';

export function eventDetail(ev: Event): EventDetail {
	const s = getState();
	const ticket_types = [...s.ticketTypes.values()].filter((t) => t.event_id === ev.id);
	const extras = [...s.extras.values()].filter((x) => x.event_id === ev.id);
	return { ...ev, ticket_types, extras };
}

export function listPublishedEvents(): Event[] {
	return [...getState().events.values()]
		.filter((e) => e.status === 'published')
		.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function listAllEvents(creatorId?: string): Event[] {
	const events = [...getState().events.values()];
	const filtered = creatorId ? events.filter((e) => e.creator_id === creatorId) : events;
	return filtered.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function ticketsForEvent(eventId: string): TicketType[] {
	return [...getState().ticketTypes.values()].filter((t) => t.event_id === eventId);
}

export function extrasForEvent(eventId: string): ExtraItem[] {
	return [...getState().extras.values()].filter((x) => x.event_id === eventId);
}
