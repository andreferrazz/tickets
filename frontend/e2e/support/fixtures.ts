/**
 * The world the e2e specs assert against. Titles are prefixed so a failure makes
 * it obvious the run is reading the seeded database and not a stray dev one.
 */

export const DRAFT_ORG = { id: '00000000-0000-4000-8000-000000000001', name: 'E2E Org' };
export const OTHER_ORG = { id: '00000000-0000-4000-8000-000000000002', name: 'E2E Other Org' };

export const MEMBER = {
    id: '00000000-0000-4000-8000-000000000010',
    email: 'member@e2e.test',
    role: 'creator',
    token: 'e2e-session-member'
};

export const ADMIN = {
    id: '00000000-0000-4000-8000-000000000011',
    email: 'admin@e2e.test',
    role: 'admin',
    token: 'e2e-session-admin'
};

export const SESSIONS = [
    { userId: MEMBER.id, token: MEMBER.token },
    { userId: ADMIN.id, token: ADMIN.token }
];

export const PUBLISHED_EVENT = {
    id: '00000000-0000-4000-8000-000000000100',
    title: 'E2E Published Show',
    status: 'published',
    organizationId: DRAFT_ORG.id,
    startsAt: '2027-03-01 20:00:00'
};

export const CLOSED_EVENT = {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'E2E Closed Show',
    status: 'closed',
    organizationId: DRAFT_ORG.id,
    startsAt: '2027-04-01 20:00:00'
};

/** Draft in the org MEMBER belongs to — visible to MEMBER, hidden from anonymous. */
export const OWN_ORG_DRAFT = {
    id: '00000000-0000-4000-8000-000000000102',
    title: 'E2E Own Org Draft',
    status: 'draft',
    organizationId: DRAFT_ORG.id,
    startsAt: '2027-05-01 20:00:00'
};

/** Draft nobody is a member of — only an admin should ever see it. */
export const OTHER_ORG_DRAFT = {
    id: '00000000-0000-4000-8000-000000000103',
    title: 'E2E Other Org Draft',
    status: 'draft',
    organizationId: OTHER_ORG.id,
    startsAt: '2027-06-01 20:00:00'
};

export interface SeededEvent {
    id: string;
    title: string;
    status: string;
    organizationId: string;
    startsAt: string;
}

export const SEEDED_EVENTS: SeededEvent[] = [
    PUBLISHED_EVENT,
    CLOSED_EVENT,
    OWN_ORG_DRAFT,
    OTHER_ORG_DRAFT
];

/** The one thing PUBLISHED_EVENT sells, so the detail page has a price to render. */
export const PUBLISHED_TICKET_TYPE = {
    id: '00000000-0000-4000-8000-000000000200',
    eventId: PUBLISHED_EVENT.id,
    name: 'E2E Pista'
};

export const PUBLISHED_BATCH = {
    id: '00000000-0000-4000-8000-000000000300',
    ticketTypeId: PUBLISHED_TICKET_TYPE.id,
    sequence: 1,
    label: 'Lote 1',
    priceCents: 12_345,
    quantityTotal: 10,
    /** MEMBER's paid (2) and pending (1) tickets, so the dashboard has stock to show. */
    quantitySold: 3
};

export const SEEDED_TICKET_TYPES = [PUBLISHED_TICKET_TYPE];
export const SEEDED_BATCHES = [PUBLISHED_BATCH];

/** A paid order MEMBER placed on PUBLISHED_EVENT: two tickets, two passes, one scanned. */
export const MEMBER_PAID_ORDER = {
    id: '00000000-0000-4000-8000-000000000400',
    userId: MEMBER.id,
    eventId: PUBLISHED_EVENT.id,
    status: 'paid',
    totalCents: 24_690,
    paidAt: '2027-01-10 12:00:00' as string | null,
    paymentUrl: null as string | null
};

/** Still waiting for payment, so it has a payment link and no passes. */
export const MEMBER_PENDING_ORDER = {
    id: '00000000-0000-4000-8000-000000000401',
    userId: MEMBER.id,
    eventId: PUBLISHED_EVENT.id,
    status: 'pending',
    totalCents: 12_345,
    paidAt: null as string | null,
    paymentUrl: 'https://fake.abacatepay.invalid/pay/bill_e2e_pending'
};

/** Someone else's order, on an event MEMBER's list must never mention. */
export const ADMIN_ORDER = {
    id: '00000000-0000-4000-8000-000000000402',
    userId: ADMIN.id,
    eventId: CLOSED_EVENT.id,
    status: 'paid',
    totalCents: 1_000,
    paidAt: '2027-01-11 12:00:00' as string | null,
    paymentUrl: null as string | null
};

export const SEEDED_ORDERS = [MEMBER_PAID_ORDER, MEMBER_PENDING_ORDER, ADMIN_ORDER];

/** A pending invitation MEMBER sent into their organization. */
export const PENDING_INVITATION = {
    id: '00000000-0000-4000-8000-000000000700',
    inviterId: MEMBER.id,
    organizationId: DRAFT_ORG.id,
    email: 'invited@e2e.test',
    role: 'participant',
    token: 'e2e-invite-token'
};

export const SEEDED_ORDER_ITEMS = [
    {
        id: '00000000-0000-4000-8000-000000000500',
        orderId: MEMBER_PAID_ORDER.id,
        itemId: PUBLISHED_TICKET_TYPE.id,
        batchId: PUBLISHED_BATCH.id as string | null,
        itemName: PUBLISHED_TICKET_TYPE.name,
        quantity: 2,
        unitPriceCents: PUBLISHED_BATCH.priceCents
    },
    {
        id: '00000000-0000-4000-8000-000000000501',
        orderId: MEMBER_PENDING_ORDER.id,
        itemId: PUBLISHED_TICKET_TYPE.id,
        batchId: PUBLISHED_BATCH.id as string | null,
        itemName: PUBLISHED_TICKET_TYPE.name,
        quantity: 1,
        unitPriceCents: PUBLISHED_BATCH.priceCents
    },
    {
        id: '00000000-0000-4000-8000-000000000502',
        orderId: ADMIN_ORDER.id,
        // A ticket type that was never seeded: order_items carries no FK on item_id.
        itemId: '00000000-0000-4000-8000-000000000201',
        batchId: null as string | null,
        itemName: 'E2E Admin Ticket',
        quantity: 1,
        unitPriceCents: 1_000
    }
];

export const SEEDED_PASSES = [
    {
        id: '00000000-0000-4000-8000-000000000600',
        orderId: MEMBER_PAID_ORDER.id,
        orderItemId: SEEDED_ORDER_ITEMS[0].id,
        token: 'e2e-pass-token-1',
        checkedInAt: null as string | null
    },
    {
        id: '00000000-0000-4000-8000-000000000601',
        orderId: MEMBER_PAID_ORDER.id,
        orderItemId: SEEDED_ORDER_ITEMS[0].id,
        token: 'e2e-pass-token-2',
        checkedInAt: '2027-03-01 21:00:00' as string | null
    }
];

/** Well-formed but never seeded — the 404 path for an event that does not exist. */
export const MISSING_EVENT_ID = '00000000-0000-4000-8000-000000000999';
