import { readAbacatePayConfig } from '$lib/config/abacate-pay';
import { resolveIntegrationMode, type IntegrationMode } from '$lib/config/integrations';
import { readSmtpConfig } from '$lib/config/smtp';
import { getQueryableInstance } from '$lib/db/pool';
import { getFakeAbacatePay } from '$lib/integrations/abacate-pay/fake';
import type { AbacatePayGateway } from '$lib/integrations/abacate-pay/gateway';
import { getLiveAbacatePay } from '$lib/integrations/abacate-pay/live';
import { getFakeMailer } from '$lib/integrations/mail/fake-mailer';
import type { Mailer } from '$lib/integrations/mail/mailer';
import { getSmtpMailer } from '$lib/integrations/mail/smtp-mailer';
import { getEventDetailMapper } from '$lib/modules/events/detail-mapper';
import { getEventDetailRepository } from '$lib/modules/events/detail-repository';
import { getEventDetailService } from '$lib/modules/events/detail-service';
import { getEventMapper } from '$lib/modules/events/mapper';
import { getEventRepository } from '$lib/modules/events/repository';
import { getEventService } from '$lib/modules/events/service';
import type { EventService } from '$lib/modules/events/service';
import { getSessionRepository } from '$lib/modules/sessions/repository';
import { getSessionService } from '$lib/modules/sessions/service';
import type { SessionService } from '$lib/modules/sessions/service';
import { getEventDetailBff, type EventsBff } from './bff/events';
import { getHomeBff, type HomeBff } from './bff/home';

/**
 * Everything a request handler is allowed to reach for. One entry per domain
 * module, exposing that module's service — repositories stay an implementation
 * detail of the module that owns them.
 */
export interface Container {
    /** Which Abacate Pay and mail implementations this graph was built with. */
    integrationMode: IntegrationMode;
    abacatePay: AbacatePayGateway;
    mailer: Mailer;
    eventService: EventService;
    sessionService: SessionService;
    homeBff: HomeBff;
    eventsBff: EventsBff;
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
    container ??= createContainer();
    return container;
}

function createContainer(): Container {
    const integrationMode = resolveIntegrationMode();

    // integrations: the one place the fake/live choice is made. Live config is
    // only read on the live branch, so a fake run needs no secrets at all.
    const abacatePay =
        integrationMode === 'fake'
            ? getFakeAbacatePay()
            : getLiveAbacatePay(readAbacatePayConfig());
    const mailer = integrationMode === 'fake' ? getFakeMailer() : getSmtpMailer(readSmtpConfig());

    // repositories
    const queryable = getQueryableInstance();
    const sessionRepository = getSessionRepository(queryable);
    const eventRepository = getEventRepository(queryable);
    const eventDetailRepository = getEventDetailRepository(queryable);

    // services
    const sessionService = getSessionService(sessionRepository);
    const eventService = getEventService(eventRepository);
    const eventDetailService = getEventDetailService(eventDetailRepository);

    // mappers
    const eventMapper = getEventMapper();
    const eventDetailMapper = getEventDetailMapper(eventMapper);

    // bff
    const homeBff = getHomeBff(eventService, eventMapper);
    const eventsBff = getEventDetailBff(eventService, eventDetailService, eventDetailMapper);

    return {
        integrationMode,
        abacatePay,
        mailer,
        sessionService,
        eventService,
        homeBff,
        eventsBff
    };
}

let container: Container | null;
