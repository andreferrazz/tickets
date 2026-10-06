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
import { getUserMapper } from '$lib/modules/accounts/mapper';
import { getUserRepository } from '$lib/modules/accounts/repository';
import { getEventDetailMapper } from '$lib/modules/events/detail-mapper';
import { getEventDetailRepository } from '$lib/modules/events/detail-repository';
import { getEventDetailService } from '$lib/modules/events/detail-service';
import { getEventMapper } from '$lib/modules/events/mapper';
import { getEventRepository } from '$lib/modules/events/repository';
import { getManagedEventFinder } from '$lib/modules/events/managed-event';
import { getEventService } from '$lib/modules/events/service';
import { getEventStatsMapper } from '$lib/modules/events/stats-mapper';
import { getEventStatsRepository } from '$lib/modules/events/stats-repository';
import { getEventStatsService } from '$lib/modules/events/stats-service';
import { getInvitationMapper } from '$lib/modules/invitations/mapper';
import { getInvitationRepository } from '$lib/modules/invitations/repository';
import { getInvitationService } from '$lib/modules/invitations/service';
import { getEventOrderService } from '$lib/modules/orders/manager-service';
import { getOrderMapper } from '$lib/modules/orders/mapper';
import { getOrderRepository } from '$lib/modules/orders/repository';
import { getOrderService } from '$lib/modules/orders/service';
import type { EventService } from '$lib/modules/events/service';
import { getOrganizationMapper } from '$lib/modules/organizations/mapper';
import { getOrganizationRepository } from '$lib/modules/organizations/repository';
import { getOrganizationService } from '$lib/modules/organizations/service';
import { getSessionRepository } from '$lib/modules/sessions/repository';
import { getSessionService } from '$lib/modules/sessions/service';
import type { SessionService } from '$lib/modules/sessions/service';
import { getEventDetailBff, type EventsBff } from './bff/events';
import { getHomeBff, type HomeBff } from './bff/home';
import { getAdminBff, type AdminBff } from './bff/admin';
import { getDashboardBff, type DashboardBff } from './bff/dashboard';
import { getEventOrdersBff, type EventOrdersBff } from './bff/event-orders';
import { getOrdersBff, type OrdersBff } from './bff/orders';
import { getOrganizationsBff, type OrganizationsBff } from './bff/organizations';
import { getScanBff, type ScanBff } from './bff/scan';

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
    ordersBff: OrdersBff;
    dashboardBff: DashboardBff;
    eventOrdersBff: EventOrdersBff;
    organizationsBff: OrganizationsBff;
    adminBff: AdminBff;
    scanBff: ScanBff;
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
    const orderRepository = getOrderRepository(queryable);
    const organizationRepository = getOrganizationRepository(queryable);
    const invitationRepository = getInvitationRepository(queryable);
    const userRepository = getUserRepository(queryable);
    const eventStatsRepository = getEventStatsRepository(queryable);

    // services
    const sessionService = getSessionService(sessionRepository);
    const eventService = getEventService(eventRepository);
    const eventDetailService = getEventDetailService(eventDetailRepository);
    const orderService = getOrderService(orderRepository);
    const organizationService = getOrganizationService(organizationRepository);
    const managedEvents = getManagedEventFinder({
        events: eventRepository,
        organizations: organizationService
    });
    const eventStatsService = getEventStatsService({
        managedEvents,
        details: eventDetailService,
        stats: eventStatsRepository,
        organizations: organizationService
    });
    const eventOrderService = getEventOrderService({ orders: orderRepository, managedEvents });
    const invitationService = getInvitationService({
        invitations: invitationRepository,
        organizations: organizationService
    });

    // mappers
    const eventMapper = getEventMapper();
    const eventDetailMapper = getEventDetailMapper(eventMapper);
    const orderMapper = getOrderMapper();
    const eventStatsMapper = getEventStatsMapper();
    const organizationMapper = getOrganizationMapper();
    const invitationMapper = getInvitationMapper();
    const userMapper = getUserMapper();

    // bff
    const homeBff = getHomeBff(eventService, eventMapper);
    const eventsBff = getEventDetailBff(eventService, eventDetailService, eventDetailMapper);
    const ordersBff = getOrdersBff(orderService, orderMapper);
    const dashboardBff = getDashboardBff(eventStatsService, eventStatsMapper);
    const eventOrdersBff = getEventOrdersBff(eventOrderService, orderMapper);
    const organizationsBff = getOrganizationsBff({
        organizations: organizationService,
        organizationMapper,
        invitations: invitationService,
        invitationMapper
    });
    const adminBff = getAdminBff({
        invitations: invitationService,
        invitationMapper,
        users: userRepository,
        userMapper
    });
    const scanBff = getScanBff({
        events: eventService,
        eventMapper,
        organizations: organizationService
    });

    return {
        integrationMode,
        abacatePay,
        mailer,
        sessionService,
        eventService,
        homeBff,
        eventsBff,
        ordersBff,
        dashboardBff,
        eventOrdersBff,
        organizationsBff,
        adminBff,
        scanBff
    };
}

let container: Container | null;
