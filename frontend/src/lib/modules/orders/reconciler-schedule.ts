import type { OrderReconcilerConfig } from '$lib/config/order-reconciler';
import type { OrderReconciler } from './reconciliation-service';

const INTERVAL_MS = 10 * 60_000;
// Survives a dev-server reload of the module that calls this, so a reload
// replaces the timer instead of stacking a second one.
const TIMER = Symbol.for('tickets.order-reconciler.timer');

type TimerHolder = { [TIMER]?: ReturnType<typeof setInterval> };

/**
 * Runs the order reconciler every ten minutes for the life of the process, as
 * Phoenix's `ExpiryWorker` did. A sweep still running when the next one is due
 * is not joined by a second, and a sweep that throws is logged and forgotten:
 * the next tick starts clean.
 *
 * @example
 * const config = readOrderReconcilerConfig();
 * if (config) startOrderReconciler(container.orderReconciler, config);
 */
export function startOrderReconciler(
    reconciler: OrderReconciler,
    config: OrderReconcilerConfig
): void {
    const holder = globalThis as TimerHolder;
    clearInterval(holder[TIMER]);
    let sweeping = false;
    const sweep = async (): Promise<void> => {
        if (sweeping) return;
        sweeping = true;
        await runAndLog(reconciler, config.origin);
        sweeping = false;
    };
    holder[TIMER] = setInterval(sweep, INTERVAL_MS);
    // The timer alone must not keep a process alive that is otherwise done.
    holder[TIMER].unref();
}

async function runAndLog(reconciler: OrderReconciler, origin: string): Promise<void> {
    try {
        const tally = await reconciler.run(origin);
        console.log(JSON.stringify({ level: 'info', event: 'order_reconcile_ran', ...tally }));
    } catch (cause) {
        const event = 'order_reconcile_failed';
        console.error(JSON.stringify({ level: 'error', event, error: String(cause) }));
    }
}
