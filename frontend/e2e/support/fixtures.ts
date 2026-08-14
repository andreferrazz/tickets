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
    quantityTotal: 10
};

export const SEEDED_TICKET_TYPES = [PUBLISHED_TICKET_TYPE];
export const SEEDED_BATCHES = [PUBLISHED_BATCH];

/** Well-formed but never seeded — the 404 path for an event that does not exist. */
export const MISSING_EVENT_ID = '00000000-0000-4000-8000-000000000999';
