import type { Queryable } from '$lib/db/queryable';
import { describeAbacateFailure } from '$lib/integrations/abacate-pay/errors';
import type { AbacatePayGateway } from '$lib/integrations/abacate-pay/gateway';
import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isUuid } from '$lib/utils/uuid';
import type { ManagedEventFinder } from './managed-event';
import type { EventManagementRepository, OwnedBatchRow } from './management-repository';
import type {
    BatchInput,
    CreatedEvent,
    EventInput,
    ExtraInput,
    FieldErrors,
    ManagementFailure,
    ManagementResult,
    SectionInput,
    TicketTypeInput
} from './management-types';
import {
    validateBatch,
    validateEvent,
    validateExtra,
    validateSection,
    validateTicketType
} from './management-validation';
import type { ExtraItemRow, ExtraSectionRow, TicketTypeRow } from './types';

/**
 * Event management as `Backend.Events` ruled it: every write is scoped to an
 * event the caller manages, deletes are logical, and a priced batch or extra
 * gets its Abacate Pay product inside the same transaction as its row, so
 * neither exists without the other.
 */
export interface EventManagementService {
    createEvent(user: SessionUser, input: EventInput): Promise<ManagementResult<CreatedEvent>>;
    updateEvent(
        user: SessionUser,
        eventId: string,
        input: EventInput
    ): Promise<ManagementResult<void>>;
    deleteEvent(user: SessionUser, eventId: string): Promise<ManagementResult<void>>;

    createTicketType(
        user: SessionUser,
        eventId: string,
        input: TicketTypeInput
    ): Promise<ManagementResult<void>>;
    updateTicketType(
        user: SessionUser,
        id: string,
        input: TicketTypeInput
    ): Promise<ManagementResult<void>>;
    deleteTicketType(user: SessionUser, id: string): Promise<ManagementResult<void>>;

    createBatch(
        user: SessionUser,
        ticketTypeId: string,
        input: BatchInput
    ): Promise<ManagementResult<void>>;
    updateBatch(user: SessionUser, id: string, input: BatchInput): Promise<ManagementResult<void>>;
    closeBatch(user: SessionUser, id: string): Promise<ManagementResult<void>>;
    deleteBatch(user: SessionUser, id: string): Promise<ManagementResult<void>>;

    createExtra(
        user: SessionUser,
        eventId: string,
        input: ExtraInput
    ): Promise<ManagementResult<void>>;
    updateExtra(user: SessionUser, id: string, input: ExtraInput): Promise<ManagementResult<void>>;
    deleteExtra(user: SessionUser, id: string): Promise<ManagementResult<void>>;

    createSection(
        user: SessionUser,
        eventId: string,
        input: SectionInput
    ): Promise<ManagementResult<void>>;
    updateSection(
        user: SessionUser,
        id: string,
        input: SectionInput
    ): Promise<ManagementResult<void>>;
    deleteSection(user: SessionUser, id: string): Promise<ManagementResult<void>>;
    /** Positions follow the order of `sectionIds`; ids not on the event are ignored. */
    reorderSections(
        user: SessionUser,
        eventId: string,
        sectionIds: string[]
    ): Promise<ManagementResult<void>>;
}

export interface EventManagementServiceDeps {
    queryable: Queryable;
    repository: EventManagementRepository;
    managedEvents: ManagedEventFinder;
    organizations: OrganizationService;
    abacatePay: AbacatePayGateway;
}

const ok = <T>(value: T): ManagementResult<T> => ({ ok: true, value });
const failed = <T>(failure: ManagementFailure, fieldErrors?: FieldErrors): ManagementResult<T> =>
    fieldErrors ? { ok: false, failure, fieldErrors } : { ok: false, failure };
const invalid = <T>(fieldErrors: FieldErrors): ManagementResult<T> | null =>
    Object.keys(fieldErrors).length > 0 ? failed('validation', fieldErrors) : null;

/** Thrown inside a transaction so the row rolls back when Abacate refuses the product. */
class ProductSyncError extends Error {}

export function getEventManagementService(
    deps: EventManagementServiceDeps
): EventManagementService {
    const { repository: repo } = deps;

    // Phoenix put every create behind `RequireCreatorPlug`: managing an
    // organization is not enough for a member whose own role is still `buyer`.
    const mayCreate = (user: SessionUser) => user.role === 'creator' || user.role === 'admin';

    const ownedTicketType = async (
        user: SessionUser,
        id: string
    ): Promise<TicketTypeRow | null> => {
        if (!isUuid(id)) return null;
        const ticketType = await repo.findTicketType(id);
        return ticketType && (await deps.managedEvents.find(user, ticketType.event_id))
            ? ticketType
            : null;
    };
    const ownedBatch = async (user: SessionUser, id: string): Promise<OwnedBatchRow | null> => {
        if (!isUuid(id)) return null;
        const batch = await repo.findBatch(id);
        return batch && (await deps.managedEvents.find(user, batch.event_id)) ? batch : null;
    };
    const ownedExtra = async (user: SessionUser, id: string): Promise<ExtraItemRow | null> => {
        if (!isUuid(id)) return null;
        const extra = await repo.findExtra(id);
        return extra && (await deps.managedEvents.find(user, extra.event_id)) ? extra : null;
    };
    const ownedSection = async (user: SessionUser, id: string): Promise<ExtraSectionRow | null> => {
        if (!isUuid(id)) return null;
        const section = await repo.findSection(id);
        return section && (await deps.managedEvents.find(user, section.event_id)) ? section : null;
    };

    return {
        async createEvent(user, input) {
            if (!mayCreate(user)) return failed('forbidden');
            const errors = invalid<CreatedEvent>(validateEvent(input));
            if (errors) return errors;
            const organizationId = await resolveOrganization(deps, user);
            if (typeof organizationId !== 'string') return failed(organizationId);
            // Every event has at least one section, so the default one is born with it.
            const event = await deps.queryable.transaction(async (tx) => {
                const created = await repo.insertEvent(tx, {
                    ...input,
                    organizationId,
                    createdById: user.id
                });
                await repo.insertSection(tx, created.id, { title: 'Addons', description: null }, 0);
                return created;
            });
            return ok({ id: event.id });
        },

        async updateEvent(user, eventId, input) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            const errors = invalid<void>(validateEvent(input));
            if (errors) return errors;
            await repo.updateEvent(event.id, input);
            return ok(undefined);
        },

        async deleteEvent(user, eventId) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            await deps.queryable.transaction((tx) => repo.softDeleteEventCascade(tx, event.id));
            return ok(undefined);
        },

        async createTicketType(user, eventId, input) {
            if (!mayCreate(user)) return failed('forbidden');
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            const errors = invalid<void>(validateTicketType(input));
            if (errors) return errors;
            await repo.insertTicketType(event.id, input.name.trim());
            return ok(undefined);
        },

        async updateTicketType(user, id, input) {
            if (!(await ownedTicketType(user, id))) return failed('not_found');
            const errors = invalid<void>(validateTicketType(input));
            if (errors) return errors;
            await repo.updateTicketTypeName(id, input.name.trim());
            return ok(undefined);
        },

        async deleteTicketType(user, id) {
            if (!(await ownedTicketType(user, id))) return failed('not_found');
            await repo.softDeleteTicketType(id);
            return ok(undefined);
        },

        async createBatch(user, ticketTypeId, input) {
            if (!mayCreate(user)) return failed('forbidden');
            const ticketType = await ownedTicketType(user, ticketTypeId);
            if (!ticketType) return failed('not_found');
            const errors = invalid<void>(validateBatch(input));
            if (errors) return errors;
            const sequence = await repo.nextBatchSequence(ticketType.id);
            return withProduct(deps, async (tx) => {
                const batch = await repo.insertBatch(tx, {
                    ...input,
                    ticketTypeId: ticketType.id,
                    sequence
                });
                const product = await createProductUnlessFree(deps, {
                    name: `${ticketType.name} - Lote ${sequence}`,
                    priceCents: batch.price_cents,
                    externalId: `batch_${batch.id}`
                });
                if (product) await repo.setBatchProduct(tx, batch.id, product);
            });
        },

        async updateBatch(user, id, input) {
            const batch = await ownedBatch(user, id);
            if (!batch) return failed('not_found');
            const errors = invalid<void>(validateBatch(input, batch.quantity_sold));
            if (errors) return errors;
            await repo.updateBatch(batch.id, input);
            return ok(undefined);
        },

        async closeBatch(user, id) {
            const batch = await ownedBatch(user, id);
            if (!batch) return failed('not_found');
            await repo.closeBatch(batch.id);
            return ok(undefined);
        },

        // Historical orders must stay resolvable to a batch row.
        async deleteBatch(user, id) {
            const batch = await ownedBatch(user, id);
            if (!batch) return failed('not_found');
            if (batch.quantity_sold > 0) return failed('batch_has_sales');
            await repo.deleteBatch(batch.id);
            return ok(undefined);
        },

        async createExtra(user, eventId, input) {
            if (!mayCreate(user)) return failed('forbidden');
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            const errors = invalid<void>(validateExtra(input));
            if (errors) return errors;
            const sectionId = await resolveSection(repo, event.id, input.sectionId);
            if (!sectionId) return failed('section_not_found');
            return withProduct(deps, async (tx) => {
                const extra = await repo.insertExtra(tx, event.id, {
                    ...input,
                    sectionId,
                    name: input.name.trim()
                });
                const product = await createProductUnlessFree(deps, {
                    name: extra.name,
                    priceCents: extra.price_cents,
                    externalId: `extra_${extra.id}`
                });
                if (product) await repo.setExtraProduct(tx, extra.id, product);
            });
        },

        async updateExtra(user, id, input) {
            const extra = await ownedExtra(user, id);
            if (!extra) return failed('not_found');
            const errors = invalid<void>(validateExtra(input));
            if (errors) return errors;
            // The section comes from the form, so it must be one of this event's.
            const sectionId = await resolveSection(
                repo,
                extra.event_id,
                input.sectionId ?? extra.section_id
            );
            if (!sectionId) return failed('section_not_found');
            await repo.updateExtra(extra.id, { ...input, sectionId, name: input.name.trim() });
            return ok(undefined);
        },

        async deleteExtra(user, id) {
            if (!(await ownedExtra(user, id))) return failed('not_found');
            await repo.softDeleteExtra(id);
            return ok(undefined);
        },

        async createSection(user, eventId, input) {
            if (!mayCreate(user)) return failed('forbidden');
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            const errors = invalid<void>(validateSection(input));
            if (errors) return errors;
            const position = await repo.nextSectionPosition(event.id);
            await deps.queryable.transaction((tx) =>
                repo.insertSection(tx, event.id, input, position)
            );
            return ok(undefined);
        },

        async updateSection(user, id, input) {
            if (!(await ownedSection(user, id))) return failed('not_found');
            const errors = invalid<void>(validateSection(input));
            if (errors) return errors;
            await repo.updateSection(id, input);
            return ok(undefined);
        },

        // The creator must remove or move the extras first, as Phoenix required.
        async deleteSection(user, id) {
            const section = await ownedSection(user, id);
            if (!section) return failed('not_found');
            if ((await repo.countLiveExtras(section.id)) > 0) return failed('section_not_empty');
            await repo.softDeleteSection(section.id);
            return ok(undefined);
        },

        async reorderSections(user, eventId, sectionIds) {
            const event = await deps.managedEvents.find(user, eventId);
            if (!event) return failed('not_found');
            const owned = await Promise.all(sectionIds.map((id) => ownedSection(user, id)));
            const onEvent = owned.filter(
                (section) => section?.event_id === event.id
            ) as ExtraSectionRow[];
            await deps.queryable.transaction(async (tx) => {
                for (const [position, section] of onEvent.entries()) {
                    await repo.updateSectionPosition(tx, section.id, position);
                }
            });
            return ok(undefined);
        }
    };
}

// Admins belong to no organization and must say which one; everyone else is
// given their only managed organization, as `Events.create_event/2` inferred it.
async function resolveOrganization(
    deps: EventManagementServiceDeps,
    user: SessionUser
): Promise<string | ManagementFailure> {
    if (user.role === 'admin') return 'organization_id_required';
    const managed = await deps.organizations.listManagedOrganizationIds(user);
    return managed.length === 1 ? managed[0] : 'organization_id_required';
}

async function resolveSection(
    repo: EventManagementRepository,
    eventId: string,
    sectionId: string | null
): Promise<string | null> {
    if (!sectionId) return repo.defaultSectionId(eventId);
    if (!isUuid(sectionId)) return null;
    const section = await repo.findSection(sectionId);
    return section?.event_id === eventId ? section.id : null;
}

// Zero-priced records get no product: Abacate rejects them and the checkout
// payload leaves free lines out anyway.
async function createProductUnlessFree(
    deps: EventManagementServiceDeps,
    product: { name: string; priceCents: number; externalId: string }
): Promise<string | null> {
    if (product.priceCents === 0) return null;
    try {
        return await deps.abacatePay.createProduct(product);
    } catch (cause) {
        throw new ProductSyncError(`abacate product for ${product.externalId} failed`, { cause });
    }
}

async function withProduct(
    deps: EventManagementServiceDeps,
    work: (tx: Queryable) => Promise<void>
): Promise<ManagementResult<void>> {
    try {
        await deps.queryable.transaction(work);
        return ok(undefined);
    } catch (cause) {
        if (!(cause instanceof ProductSyncError)) throw cause;
        console.warn(
            JSON.stringify({
                event: 'abacate_product_create_failed',
                ...describeAbacateFailure(cause.cause)
            })
        );
        return failed('abacate_unavailable');
    }
}
