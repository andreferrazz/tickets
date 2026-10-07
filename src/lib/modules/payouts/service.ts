import { randomUUID } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import { AbacatePayError, describeAbacateFailure } from '$lib/integrations/abacate-pay/errors';
import type { AbacatePayGateway } from '$lib/integrations/abacate-pay/gateway';
import type { EventStatsService } from '$lib/modules/events/stats-service';
import type { EventStatsView } from '$lib/modules/events/stats-types';
import type { OrganizationRepository } from '$lib/modules/organizations/repository';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { PixKeyType } from '$lib/types';
import { toIso8601Utc } from '$lib/utils/datetime';
import type { NewPayoutRow, PayoutRepository } from './repository';
import type {
    DestinationFailure,
    PayoutDestination,
    PayoutDto,
    PayoutFailure,
    PayoutOutcome,
    PayoutRow
} from './types';

/** The most one payout may move, in cents; also a CHECK on the table. */
export const MAX_PAYOUT_CENTS = 500_000;
/** One payout per event per day. */
export const PAYOUT_INTERVAL_HOURS = 24;

const HISTORY_SIZE = 10;
const PIX_KEY_MAX = 255;
const PIX_KEY_TYPES: readonly PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'evp'];

/**
 * Withdrawing an event's revenue to a Pix key, as `Backend.Payouts` ruled it.
 * The money is the organization's, so the key lives on the organization and
 * only its leader (or an admin) may set it or withdraw. Pending and completed
 * payouts both come off the available balance; failed and cancelled ones do
 * not, and do not count towards the one-a-day limit either.
 *
 * @example
 * const result = await payouts.request(user, params.id, 5_000);
 * if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
 */
export interface PayoutService {
    /** The event's latest payouts; null unless `user` may withdraw from it. */
    listRecent(user: SessionUser, eventId: string): Promise<PayoutDto[] | null>;
    /** Sets the Pix key every payout of the event's organization goes to. */
    saveDestination(
        user: SessionUser,
        eventId: string,
        destination: PayoutDestination
    ): Promise<PayoutOutcome<DestinationFailure>>;
    request(
        user: SessionUser,
        eventId: string,
        amountCents: number
    ): Promise<PayoutOutcome<PayoutFailure>>;
}

export interface PayoutServiceDeps {
    queryable: Queryable;
    payouts: PayoutRepository;
    /** The one place the available balance is computed, shared with the dashboard. */
    stats: EventStatsService;
    organizations: OrganizationRepository;
    abacatePay: AbacatePayGateway;
}

type Access = { view: EventStatsView } | { failure: 'not_found' | 'forbidden' };

export function getPayoutService(deps: PayoutServiceDeps): PayoutService {
    // A manager who is not the leader sees the event but not its money.
    const access = async (user: SessionUser, eventId: string): Promise<Access> => {
        const view = await deps.stats.getStats(user, eventId);
        if (!view) return { failure: 'not_found' };
        return view.canWithdraw ? { view } : { failure: 'forbidden' };
    };

    // The limit is checked and the row written under one lock, so two requests
    // sent together cannot both pass: the second sees the first one's row.
    const reserve = (row: NewPayoutRow): Promise<boolean> =>
        deps.queryable.transaction(async (tx) => {
            await deps.payouts.lockEvent(tx, row.eventId);
            if (await deps.payouts.hasRecentBlocking(tx, row.eventId, PAYOUT_INTERVAL_HOURS))
                return false;
            await deps.payouts.insertPending(tx, row);
            return true;
        });

    return {
        async listRecent(user, eventId) {
            const allowed = await access(user, eventId);
            if ('failure' in allowed) return null;
            const rows = await deps.payouts.listRecent(allowed.view.event.id, HISTORY_SIZE);
            return rows.map(toPayoutDto);
        },

        async saveDestination(user, eventId, destination) {
            const allowed = await access(user, eventId);
            if ('failure' in allowed) return { ok: false, failure: allowed.failure };
            const pixKey = destination.pixKey.trim();
            const pixKeyType = PIX_KEY_TYPES.find((type) => type === destination.pixKeyType);
            if (!pixKeyType || pixKey === '' || pixKey.length > PIX_KEY_MAX)
                return { ok: false, failure: 'invalid_pix_key' };
            await deps.organizations.setPayoutKey(allowed.view.organization.id, pixKey, pixKeyType);
            return { ok: true };
        },

        async request(user, eventId, amountCents) {
            const allowed = await access(user, eventId);
            if ('failure' in allowed) return { ok: false, failure: allowed.failure };
            const row = payoutRow(user, allowed.view, amountCents);
            if (typeof row === 'string') return { ok: false, failure: row };
            if (!(await reserve(row))) return { ok: false, failure: 'rate_limited' };
            return send(deps, row);
        }
    };
}

// The row a request would write, or why it may not be written.
function payoutRow(
    user: SessionUser,
    view: EventStatsView,
    amountCents: number
): NewPayoutRow | PayoutFailure {
    const { pix_key: pixKey, pix_key_type: pixKeyType } = view.organization;
    if (!pixKey || !pixKeyType) return 'pix_key_missing';
    const valid = Number.isInteger(amountCents) && amountCents > 0;
    if (!valid || amountCents > MAX_PAYOUT_CENTS) return 'invalid_amount';
    if (amountCents > view.totals.availableToWithdrawCents) return 'insufficient_balance';
    return {
        id: randomUUID(),
        eventId: view.event.id,
        requestedById: user.id,
        amountCents,
        pixKey,
        pixKeyType,
        externalId: randomUUID()
    };
}

// Outside any transaction: the row is already committed as pending, so a
// crash here leaves a payout that holds its money until someone looks, never
// one that was sent and forgotten.
async function send(
    deps: PayoutServiceDeps,
    row: NewPayoutRow
): Promise<PayoutOutcome<PayoutFailure>> {
    try {
        const created = await deps.abacatePay.createPayout({
            amountCents: row.amountCents,
            externalId: row.externalId,
            description: `Saque do evento ${row.eventId}`,
            pixKey: row.pixKey,
            pixKeyType: row.pixKeyType
        });
        const settled = { abacatePayoutId: created.id, errorMessage: null };
        await deps.payouts.settle(row.id, { ...settled, ...created });
        return { ok: true };
    } catch (cause) {
        return markFailed(deps, row, cause);
    }
}

// A failed payout took nothing: it stops counting against the balance and the
// daily limit. Abacate's own words go on the row, as Phoenix kept them, since
// "refused" alone does not say whether the key, the amount or the account is
// at fault; the log line stays without them.
async function markFailed(
    deps: PayoutServiceDeps,
    row: NewPayoutRow,
    cause: unknown
): Promise<PayoutOutcome<PayoutFailure>> {
    if (!(cause instanceof AbacatePayError)) throw cause;
    const described = describeAbacateFailure(cause);
    const errorMessage = `${described.failure} (${described.status ?? 'no response'}): ${cause.message}`;
    const failed = { status: 'failed' as const, abacatePayoutId: null, receiptUrl: null };
    await deps.payouts.settle(row.id, { ...failed, errorMessage });
    console.warn(JSON.stringify({ event: 'payout_failed', payoutId: row.id, ...described }));
    if (cause.failure === 'rate_limited') return { ok: false, failure: 'rate_limited' };
    const refused = cause.failure === 'invalid_data';
    return { ok: false, failure: refused ? 'abacate_refused' : 'abacate_unavailable' };
}

function toPayoutDto(row: PayoutRow): PayoutDto {
    return {
        id: row.id,
        amountCents: row.amount_cents,
        status: row.status,
        pixKey: row.pix_key,
        pixKeyType: row.pix_key_type,
        receiptUrl: row.receipt_url,
        createdAt: toIso8601Utc(row.inserted_at)
    };
}
