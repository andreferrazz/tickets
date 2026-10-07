import { readAbacatePayConfig } from '$lib/config/abacate-pay';
import { readAbacateWebhookSecret } from '$lib/config/abacate-webhook';
import { readRateLimitConfig } from '$lib/config/rate-limit';
import { resolveIntegrationMode, type IntegrationMode } from '$lib/config/integrations';
import { readSmtpConfig } from '$lib/config/smtp';
import { getQueryableInstance } from '$lib/db/pool';
import type { Queryable } from '$lib/db/queryable';
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
import {
    getOrderReconciler,
    type OrderReconciler
} from '$lib/modules/orders/reconciliation-service';
import { getOrderRepository } from '$lib/modules/orders/repository';
import { getReservationRepository } from '$lib/modules/orders/reservation-repository';
import { getOrderSettlement } from '$lib/modules/orders/settlement-service';
import { getStockReservation } from '$lib/modules/orders/stock-reservation';
import {
    getAbacateWebhook,
    type AbacateWebhook
} from '$lib/modules/webhooks/abacate-webhook-service';
import { getWebhookLogRepository } from '$lib/modules/webhooks/webhook-log-repository';
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
import { getPayoutRepository } from '$lib/modules/payouts/repository';
import { getPayoutService, type PayoutService } from '$lib/modules/payouts/service';
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

/** The in-process stand-ins, kept reachable so test-only routes can inspect them. */
export interface IntegrationFakes {
    mailer: FakeMailer;
    abacatePay: FakeAbacatePay;
}

/**
 * Everything a request handler is allowed to reach for. One entry per domain
 * module, exposing that module's service — repositories stay an implementation
 * detail of the module that owns them.
 */
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
    /** Withdrawals behind the dashboard's withdraw dialog; its actions call it directly. */
    payouts: PayoutService;
    /** Payment events from Abacate Pay; `/webhooks/abacate-pay` hands every delivery to it. */
    abacateWebhook: AbacateWebhook;
    /** The stale-order sweep; `hooks.server.ts` runs it on a timer when switched on. */
    orderReconciler: OrderReconciler;
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
    const integrations = buildIntegrations(integrationMode);
    const queryable = getQueryableInstance();
    const repositories = buildRepositories(queryable);
    const mappers = buildMappers();
    const core = buildCoreServices({ queryable, repositories, integrations });
    const orders = buildOrderServices({ queryable, repositories, integrations, core });
    const bffs = buildBffs({ repositories, mappers, core });
    return {
        integrationMode,
        ...integrations,
        sessionService: core.sessionService,
        eventService: core.eventService,
        ...bffs,
        eventManagement: core.eventManagement,
        organizations: core.organizationService,
        invitationWrites: core.invitationWrites,
        passCheckIn: core.passCheckIn,
        ...orders,
        userMapper: mappers.userMapper
    };
}

type Integrations = Pick<Container, 'fakes' | 'abacatePay' | 'mailer'>;
type Repositories = ReturnType<typeof buildRepositories>;
type Mappers = ReturnType<typeof buildMappers>;
type CoreServices = ReturnType<typeof buildCoreServices>;
type OrderServices = Pick<
    Container,
    | 'orderPlacement'
    | 'orderCancellation'
    | 'compTickets'
    | 'payouts'
    | 'abacateWebhook'
    | 'orderReconciler'
>;
type Bffs = Pick<
    Container,
    | 'homeBff'
    | 'eventsBff'
    | 'ordersBff'
    | 'dashboardBff'
    | 'eventOrdersBff'
    | 'organizationsBff'
    | 'adminBff'
    | 'scanBff'
    | 'authBff'
    | 'eventManagementBff'
>;

// The one place the fake/live choice is made. Live config is only read on the
// live branch, so a fake run needs no secrets at all.
function buildIntegrations(mode: IntegrationMode): Integrations {
    const fakes: IntegrationFakes | null =
        mode === 'fake' ? { mailer: getFakeMailer(), abacatePay: getFakeAbacatePay() } : null;
    const abacatePay = fakes?.abacatePay ?? getLiveAbacatePay({ config: readAbacatePayConfig() });
    const mailer = fakes?.mailer ?? getSmtpMailer(readSmtpConfig());
    return { fakes, abacatePay, mailer };
}

function buildRepositories(queryable: Queryable) {
    return {
        sessions: getSessionRepository({ queryable }),
        events: getEventRepository({ queryable }),
        eventDetails: getEventDetailRepository({ queryable }),
        orders: getOrderRepository({ queryable }),
        organizations: getOrganizationRepository({ queryable }),
        invitations: getInvitationRepository({ queryable }),
        users: getUserRepository({ queryable }),
        eventStats: getEventStatsRepository({ queryable }),
        authCodes: getAuthCodeRepository({ queryable }),
        impersonations: getImpersonationRepository({ queryable }),
        eventManagement: getEventManagementRepository({ queryable }),
        passes: getPassRepository({ queryable }),
        reservations: getReservationRepository({ queryable }),
        orderStates: getOrderStateRepository({ queryable }),
        webhookLog: getWebhookLogRepository({ queryable }),
        payouts: getPayoutRepository({ queryable })
    };
}

function buildMappers() {
    const eventMapper = getEventMapper();
    return {
        eventMapper,
        eventDetailMapper: getEventDetailMapper({ mapper: eventMapper }),
        orderMapper: getOrderMapper(),
        eventStatsMapper: getEventStatsMapper(),
        organizationMapper: getOrganizationMapper(),
        invitationMapper: getInvitationMapper(),
        userMapper: getUserMapper()
    };
}

interface CoreServiceDeps {
    queryable: Queryable;
    repositories: Repositories;
    integrations: Integrations;
}

// Everything that is not the money path: who the caller is, what they may see
// and manage, and how they got in.
function buildCoreServices({ queryable, repositories: repos, integrations }: CoreServiceDeps) {
    const { abacatePay, mailer } = integrations;
    const organizationService = getOrganizationService({ repository: repos.organizations });
    const eventDetailService = getEventDetailService({ repository: repos.eventDetails });
    const managedEvents = getManagedEventFinder({
        events: repos.events,
        organizations: organizationService
    });
    const authService = getAuthService({
        queryable,
        users: repos.users,
        authCodes: repos.authCodes,
        sessions: repos.sessions,
        invitations: repos.invitations,
        organizations: repos.organizations,
        mailer
    });
    return {
        organizationService,
        eventDetailService,
        managedEvents,
        authService,
        sessionService: getSessionService({ repository: repos.sessions }),
        eventService: getEventService({ repository: repos.events }),
        orderService: getOrderService({ repository: repos.orders }),
        eventStatsService: getEventStatsService({
            managedEvents,
            details: eventDetailService,
            stats: repos.eventStats,
            organizations: organizationService
        }),
        eventOrderService: getEventOrderService({ orders: repos.orders, managedEvents }),
        invitationService: getInvitationService({
            invitations: repos.invitations,
            organizations: organizationService
        }),
        passCheckIn: getPassCheckInService({
            passes: repos.passes,
            events: repos.events,
            organizations: repos.organizations
        }),
        profileService: getProfileService({ users: repos.users, abacatePay }),
        invitationWrites: getInvitationWriteService({
            queryable,
            invitations: repos.invitations,
            organizations: repos.organizations,
            organizationService,
            users: repos.users,
            auth: authService,
            mailer
        }),
        eventManagement: getEventManagementService({
            queryable,
            repository: repos.eventManagement,
            managedEvents,
            organizations: organizationService,
            abacatePay
        })
    };
}

interface OrderServiceDeps extends CoreServiceDeps {
    core: CoreServices;
}

// The money path: reserving stock, placing and settling orders, paying out.
function buildOrderServices(deps: OrderServiceDeps): OrderServices {
    const { queryable, repositories: repos, core } = deps;
    const { abacatePay, mailer } = deps.integrations;
    const { managedEvents } = core;
    const orderStates = repos.orderStates;
    const cart = getCartResolver({ reservations: repos.reservations });
    const stock = getStockReservation({
        queryable,
        reservations: repos.reservations,
        passes: repos.passes
    });
    const fulfilment = getOrderFulfilment({
        queryable,
        orderStates,
        orders: repos.orders,
        passes: repos.passes,
        mailer
    });
    const freeOrders = getFreeOrderSettlement({ orderStates, fulfilment, stock });
    const settlement = getOrderSettlement({ orderStates, fulfilment, stock });
    return {
        orderPlacement: getOrderPlacement({
            events: repos.events,
            users: repos.users,
            cart,
            stock,
            freeOrders,
            orderStates,
            abacatePay
        }),
        orderCancellation: getOrderCancellation({
            orderStates,
            stock,
            managedEvents,
            abacatePay,
            fulfilment
        }),
        compTickets: getCompTicketIssuer({
            managedEvents,
            users: repos.users,
            cart,
            stock,
            freeOrders
        }),
        abacateWebhook: getAbacateWebhook({
            secret: readAbacateWebhookSecret(),
            log: repos.webhookLog,
            settlement
        }),
        orderReconciler: getOrderReconciler({ orderStates, stock, fulfilment, abacatePay }),
        payouts: getPayoutService({
            queryable,
            payouts: repos.payouts,
            stats: core.eventStatsService,
            organizations: repos.organizations,
            abacatePay
        })
    };
}

interface BffDeps {
    repositories: Repositories;
    mappers: Mappers;
    core: CoreServices;
}

function buildBffs({ repositories: repos, mappers, core }: BffDeps): Bffs {
    const { eventMapper, orderMapper, invitationMapper, userMapper } = mappers;
    return {
        homeBff: getHomeBff({ service: core.eventService, mapper: eventMapper }),
        eventsBff: getEventDetailBff({
            service: core.eventService,
            detailService: core.eventDetailService,
            mapper: mappers.eventDetailMapper
        }),
        ordersBff: getOrdersBff({ service: core.orderService, mapper: orderMapper }),
        dashboardBff: getDashboardBff({
            service: core.eventStatsService,
            mapper: mappers.eventStatsMapper
        }),
        eventOrdersBff: getEventOrdersBff({ service: core.eventOrderService, mapper: orderMapper }),
        organizationsBff: getOrganizationsBff({
            organizations: core.organizationService,
            organizationMapper: mappers.organizationMapper,
            invitations: core.invitationService,
            invitationMapper
        }),
        adminBff: getAdminBff({
            invitations: core.invitationService,
            invitationMapper,
            users: repos.users,
            userMapper
        }),
        scanBff: getScanBff({
            events: core.eventService,
            eventMapper,
            organizations: core.organizationService
        }),
        eventManagementBff: getEventManagementBff({
            managedEvents: core.managedEvents,
            details: core.eventDetailService,
            detailMapper: mappers.eventDetailMapper
        }),
        authBff: buildAuthBff({ repositories: repos, mappers, core })
    };
}

function buildAuthBff({ repositories: repos, mappers, core }: BffDeps): AuthBff {
    const rateLimits = readRateLimitConfig();
    return getAuthBff({
        auth: core.authService,
        profile: core.profileService,
        users: repos.users,
        organizations: repos.organizations,
        userMapper: mappers.userMapper,
        // Process-local, like the ETS table it replaces: one instance per server.
        rateLimiter: getFixedWindowRateLimiter(),
        requestCodeLimit: rateLimits.requestCodePerMinute,
        verifyAttemptLimit: rateLimits.verifyAttemptsPerCode,
        impersonations: repos.impersonations
    });
}

let container: Container | null;
