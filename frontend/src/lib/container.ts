import { readAbacatePayConfig } from '$lib/config/abacate-pay';
import { readRateLimitConfig } from '$lib/config/rate-limit';
import { resolveIntegrationMode, type IntegrationMode } from '$lib/config/integrations';
import { readSmtpConfig } from '$lib/config/smtp';
import { getQueryableInstance } from '$lib/db/pool';
import { getFakeAbacatePay, type FakeAbacatePay } from '$lib/integrations/abacate-pay/fake';
import type { AbacatePayGateway } from '$lib/integrations/abacate-pay/gateway';
import { getLiveAbacatePay } from '$lib/integrations/abacate-pay/live';
import { getFakeMailer, type FakeMailer } from '$lib/integrations/mail/fake-mailer';
import type { Mailer } from '$lib/integrations/mail/mailer';
import { getSmtpMailer } from '$lib/integrations/mail/smtp-mailer';
import { getAuthCodeRepository } from '$lib/modules/accounts/auth-code-repository';
import { getImpersonationRepository } from '$lib/modules/accounts/impersonation-repository';
import { getAuthService } from '$lib/modules/accounts/auth-service';
import { getUserMapper, type UserMapper } from '$lib/modules/accounts/mapper';
import { getProfileService } from '$lib/modules/accounts/profile-service';
import { getFixedWindowRateLimiter } from '$lib/modules/accounts/rate-limit';
import { getUserRepository } from '$lib/modules/accounts/repository';
import { getEventDetailMapper } from '$lib/modules/events/detail-mapper';
import { getEventDetailRepository } from '$lib/modules/events/detail-repository';
import { getEventDetailService } from '$lib/modules/events/detail-service';
import { getEventMapper } from '$lib/modules/events/mapper';
import { getEventRepository } from '$lib/modules/events/repository';
import { getManagedEventFinder } from '$lib/modules/events/managed-event';
import { getEventManagementRepository } from '$lib/modules/events/management-repository';
import {
    getEventManagementService,
    type EventManagementService
} from '$lib/modules/events/management-service';
import { getEventService } from '$lib/modules/events/service';
import { getEventStatsMapper } from '$lib/modules/events/stats-mapper';
import { getEventStatsRepository } from '$lib/modules/events/stats-repository';
import { getEventStatsService } from '$lib/modules/events/stats-service';
import { getInvitationMapper } from '$lib/modules/invitations/mapper';
import { getInvitationRepository } from '$lib/modules/invitations/repository';
import { getInvitationService } from '$lib/modules/invitations/service';
import {
    getInvitationWriteService,
    type InvitationWriteService
} from '$lib/modules/invitations/write-service';
import {
    getOrderCancellation,
    type OrderCancellation
} from '$lib/modules/orders/cancellation-service';
import { getCartResolver } from '$lib/modules/orders/cart-resolution';
import { getCompTicketIssuer, type CompTicketIssuer } from '$lib/modules/orders/comp-service';
import { getFreeOrderSettlement } from '$lib/modules/orders/free-order';
import { getOrderFulfilment } from '$lib/modules/orders/fulfilment-service';
import { getEventOrderService } from '$lib/modules/orders/manager-service';
import { getOrderMapper } from '$lib/modules/orders/mapper';
import { getOrderStateRepository } from '$lib/modules/orders/order-state-repository';
import { getOrderPlacement, type OrderPlacement } from '$lib/modules/orders/placement-service';
import { getOrderRepository } from '$lib/modules/orders/repository';
import { getReservationRepository } from '$lib/modules/orders/reservation-repository';
import { getStockReservation } from '$lib/modules/orders/stock-reservation';
import { getOrderService } from '$lib/modules/orders/service';
import type { EventService } from '$lib/modules/events/service';
import { getOrganizationMapper } from '$lib/modules/organizations/mapper';
import { getOrganizationRepository } from '$lib/modules/organizations/repository';
import {
    getOrganizationService,
    type OrganizationService
} from '$lib/modules/organizations/service';
import {
    getPassCheckInService,
    type PassCheckInService
} from '$lib/modules/passes/checkin-service';
import { getPassRepository } from '$lib/modules/passes/repository';
import { getSessionRepository } from '$lib/modules/sessions/repository';
import { getSessionService } from '$lib/modules/sessions/service';
import type { SessionService } from '$lib/modules/sessions/service';
import { getEventDetailBff, type EventsBff } from './bff/events';
import { getHomeBff, type HomeBff } from './bff/home';
import { getAdminBff, type AdminBff } from './bff/admin';
import { getAuthBff, type AuthBff } from './bff/auth';
import { getDashboardBff, type DashboardBff } from './bff/dashboard';
import { getEventManagementBff, type EventManagementBff } from './bff/event-management';
import { getEventOrdersBff, type EventOrdersBff } from './bff/event-orders';
import { getOrdersBff, type OrdersBff } from './bff/orders';
import { getOrganizationsBff, type OrganizationsBff } from './bff/organizations';
import { getScanBff, type ScanBff } from './bff/scan';

/**
 * Everything a request handler is allowed to reach for. One entry per domain
 * module, exposing that module's service — repositories stay an implementation
 * detail of the module that owns them.
 */
/** The in-process stand-ins, kept reachable so test-only routes can inspect them. */
export interface IntegrationFakes {
    mailer: FakeMailer;
    abacatePay: FakeAbacatePay;
}

export interface Container {
    /** Which Abacate Pay and mail implementations this graph was built with. */
    integrationMode: IntegrationMode;
    /** Null unless `INTEGRATIONS=fake`; the `/e2e-fakes` routes answer 404 without it. */
    fakes: IntegrationFakes | null;
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
    authBff: AuthBff;
    eventManagementBff: EventManagementBff;
    /** Writes behind the event edit page; the actions call it directly. */
    eventManagement: EventManagementService;
    /** Membership and rename writes; the team and onboarding actions call it directly. */
    organizations: OrganizationService;
    invitationWrites: InvitationWriteService;
    /** Pass validation at the door; the scan page's load and action call it directly. */
    passCheckIn: PassCheckInService;
    /** Checkout from the event page; its `buy` action calls it directly. */
    orderPlacement: OrderPlacement;
    /** Behind every `cancel` action: the buyer's order pages and the event's order list. */
    orderCancellation: OrderCancellation;
    /** Free tickets from the comp page's `send` action. */
    compTickets: CompTicketIssuer;
    /** For the one load that signs a user in outside the auth BFF: the invite link. */
    userMapper: UserMapper;
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
    const fakes: IntegrationFakes | null =
        integrationMode === 'fake'
            ? { mailer: getFakeMailer(), abacatePay: getFakeAbacatePay() }
            : null;
    const abacatePay = fakes?.abacatePay ?? getLiveAbacatePay(readAbacatePayConfig());
    const mailer = fakes?.mailer ?? getSmtpMailer(readSmtpConfig());

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
    const authCodeRepository = getAuthCodeRepository(queryable);
    const impersonationRepository = getImpersonationRepository(queryable);
    const eventManagementRepository = getEventManagementRepository(queryable);
    const passRepository = getPassRepository(queryable);
    const reservationRepository = getReservationRepository(queryable);
    const orderStateRepository = getOrderStateRepository(queryable);

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
    const authService = getAuthService({
        queryable,
        users: userRepository,
        authCodes: authCodeRepository,
        sessions: sessionRepository,
        invitations: invitationRepository,
        organizations: organizationRepository,
        mailer
    });
    const passCheckIn = getPassCheckInService({
        passes: passRepository,
        events: eventRepository,
        organizations: organizationRepository
    });
    const profileService = getProfileService({ users: userRepository, abacatePay });
    const invitationWrites = getInvitationWriteService({
        queryable,
        invitations: invitationRepository,
        organizations: organizationRepository,
        organizationService,
        users: userRepository,
        auth: authService,
        mailer
    });
    const eventManagement = getEventManagementService({
        queryable,
        repository: eventManagementRepository,
        managedEvents,
        organizations: organizationService,
        abacatePay
    });
    const cartResolver = getCartResolver(reservationRepository);
    const stockReservation = getStockReservation({
        queryable,
        reservations: reservationRepository,
        passes: passRepository
    });
    const orderFulfilment = getOrderFulfilment({
        queryable,
        orderStates: orderStateRepository,
        orders: orderRepository,
        passes: passRepository,
        mailer
    });
    const freeOrders = getFreeOrderSettlement({
        orderStates: orderStateRepository,
        fulfilment: orderFulfilment,
        stock: stockReservation
    });
    const orderPlacement = getOrderPlacement({
        events: eventRepository,
        users: userRepository,
        cart: cartResolver,
        stock: stockReservation,
        freeOrders,
        orderStates: orderStateRepository,
        abacatePay
    });
    const orderCancellation = getOrderCancellation({
        orderStates: orderStateRepository,
        stock: stockReservation,
        managedEvents,
        abacatePay,
        fulfilment: orderFulfilment
    });
    const compTickets = getCompTicketIssuer({
        managedEvents,
        users: userRepository,
        cart: cartResolver,
        stock: stockReservation,
        freeOrders
    });
    // Process-local, like the ETS table it replaces: one instance per server.
    const rateLimiter = getFixedWindowRateLimiter();
    const rateLimits = readRateLimitConfig();

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
    const eventManagementBff = getEventManagementBff({
        managedEvents,
        details: eventDetailService,
        detailMapper: eventDetailMapper
    });
    const authBff = getAuthBff({
        auth: authService,
        profile: profileService,
        users: userRepository,
        organizations: organizationRepository,
        userMapper,
        rateLimiter,
        requestCodeLimit: rateLimits.requestCodePerMinute,
        verifyAttemptLimit: rateLimits.verifyAttemptsPerCode,
        impersonations: impersonationRepository
    });

    return {
        integrationMode,
        fakes,
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
        scanBff,
        authBff,
        eventManagementBff,
        eventManagement,
        organizations: organizationService,
        invitationWrites,
        passCheckIn,
        orderPlacement,
        orderCancellation,
        compTickets,
        userMapper
    };
}

let container: Container | null;
