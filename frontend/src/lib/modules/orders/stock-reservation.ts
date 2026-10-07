import type { Queryable } from '$lib/db/queryable';
import type { PassRepository } from '$lib/modules/passes/repository';
import type { OrderStatus } from '$lib/types';
import type { OrderOutcome, ReservableLine } from './checkout-types';
import type { ReservationRepository } from './reservation-repository';

export interface StockRelease {
    orderId: string;
    /** The statuses the order may be leaving; anything else and nothing happens. */
    from: readonly OrderStatus[];
    to: 'cancelled' | 'expired' | 'refunded';
    /** For orders that were fulfilled: a cancelled free order and a refund lose their passes. */
    deletePasses: boolean;
}

/**
 * Holding stock for an order and giving it back. Stock is taken when the order
 * is created, not when it is paid, exactly as `Backend.Orders.reserve_order/4`
 * did; an order that never gets paid releases it again.
 *
 * @example
 * const reserved = await stock.reserve(user.id, event.id, lines);
 * if (!reserved.ok) return reserved; // { failure: 'out_of_stock', itemName }
 */
export interface StockReservation {
    /** Creates the pending order with its items and takes their stock; returns the order id. */
    reserve(
        userId: string,
        eventId: string,
        lines: ReservableLine[]
    ): Promise<OrderOutcome<string, 'out_of_stock'>>;
    /** False when the order had already left `from`: stock is only ever given back once. */
    release(release: StockRelease): Promise<boolean>;
}

export interface StockReservationDeps {
    queryable: Queryable;
    reservations: ReservationRepository;
    passes: PassRepository;
}

/** Thrown inside the reserving transaction so the order and its items roll back. */
class SoldOutError extends Error {
    constructor(readonly itemName: string) {
        super(`no stock left for ${itemName}`);
    }
}

export function getStockReservation(deps: StockReservationDeps): StockReservation {
    const repo = deps.reservations;

    const take = (tx: Queryable, line: ReservableLine): Promise<boolean> =>
        line.batchId
            ? repo.reserveBatch(tx, line.batchId, line.quantity)
            : repo.reserveExtra(tx, line.itemId, line.quantity);

    const reserveIn = async (
        tx: Queryable,
        userId: string,
        eventId: string,
        lines: ReservableLine[]
    ): Promise<string> => {
        const total = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
        const orderId = await repo.insertOrder(tx, userId, eventId, total);
        for (const line of lines) {
            await repo.insertItem(tx, orderId, line);
            if (!(await take(tx, line))) throw new SoldOutError(line.name);
        }
        return orderId;
    };

    const giveBack = async (tx: Queryable, orderId: string): Promise<void> => {
        for (const item of await repo.listReservedItems(tx, orderId)) {
            if (item.item_type === 'extra')
                await repo.releaseExtra(tx, item.item_id, item.quantity);
            // Ticket lines older than batches carry no batch and hold no stock.
            else if (item.batch_id) await repo.releaseBatch(tx, item.batch_id, item.quantity);
        }
    };

    return {
        async reserve(userId, eventId, lines) {
            try {
                const orderId = await deps.queryable.transaction((tx) =>
                    reserveIn(tx, userId, eventId, lines)
                );
                return { ok: true, value: orderId };
            } catch (cause) {
                if (!(cause instanceof SoldOutError)) throw cause;
                return { ok: false, failure: 'out_of_stock', itemName: cause.itemName };
            }
        },

        release({ orderId, from, to, deletePasses }) {
            return deps.queryable.transaction(async (tx) => {
                if (!(await repo.claimStatus(tx, orderId, from, to))) return false;
                await giveBack(tx, orderId);
                if (deletePasses) await deps.passes.deleteForOrder(tx, orderId);
                return true;
            });
        }
    };
}
