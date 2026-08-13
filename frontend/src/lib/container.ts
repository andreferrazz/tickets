import type { Queryable } from '$lib/db/queryable';
import { eventRepository } from '$lib/modules/events/repository';
import { eventService } from '$lib/modules/events/service';
import type { EventService } from '$lib/modules/events/types';
import { sessionRepository } from '$lib/modules/sessions/repository';
import { sessionService } from '$lib/modules/sessions/service';
import type { SessionService } from '$lib/modules/sessions/types';

/**
 * Everything a request handler is allowed to reach for. One entry per domain
 * module, exposing that module's service — repositories stay an implementation
 * detail of the module that owns them.
 */
export interface Container {
	events: EventService;
	sessions: SessionService;
}

/**
 * The composition root: the single place that knows how the object graph fits
 * together. Handlers receive the result through `event.locals` and never build
 * their own, so swapping an implementation is a change here and nowhere else.
 *
 * Pure functions stay ordinary imports. Only things with dependencies belong in
 * the graph, otherwise this becomes a registry of everything.
 *
 * @example
 * const container = createContainer({ queryable: deferredQueryable() });
 * const rows = await container.events.listVisible(user);
 */
export function createContainer(deps: { queryable: Queryable }): Container {
	return {
		events: eventService({ repository: eventRepository(deps) }),
		sessions: sessionService({ repository: sessionRepository(deps) })
	};
}
