import { getQueryableInstance } from '$lib/db/queryable';
import { getEventMapper } from '$lib/modules/events/mapper';
import { getEventRepository } from '$lib/modules/events/repository';
import { getEventService } from '$lib/modules/events/service';
import type { EventService } from '$lib/modules/events/service';
import { getSessionRepository } from '$lib/modules/sessions/repository';
import { getSessionService } from '$lib/modules/sessions/service';
import type { SessionService } from '$lib/modules/sessions/service';
import { getHomeBff, type HomeBff } from './bff/home';

/**
 * Everything a request handler is allowed to reach for. One entry per domain
 * module, exposing that module's service — repositories stay an implementation
 * detail of the module that owns them.
 */
export interface Container {
	eventService: EventService;
	sessionService: SessionService;
	homeBff: HomeBff;
}

/**
 * The composition root: the single place that knows how the object graph fits
 * together. Handlers receive the result through `event.locals` and never build
 * their own, so swapping an implementation is a change here and nowhere else.
 *
 * Pure functions stay ordinary imports. Only things with dependencies belong in
 * the graph, otherwise this becomes a registry of everything.
 */
export function getContainer(): Container {
	container ??= createContainer()
	return container
}

function createContainer(): Container {
	
	// repositories
	const queryable = getQueryableInstance()
	const sessionRepository = getSessionRepository(queryable)
	const eventRepository = getEventRepository(queryable)

	// services
	const sessionService = getSessionService(sessionRepository)
	const eventService = getEventService(eventRepository)

	// mappers
	const eventMapper = getEventMapper()

	// bff
	const homeBff = getHomeBff(eventService, eventMapper);
	
	return {
		sessionService,
		eventService,
		homeBff,
	};
}

let container: Container | null
