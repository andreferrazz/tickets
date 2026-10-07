import { env } from '$env/dynamic/private';

export interface OrderReconcilerConfig {
    /** The site's public origin, for the order links in the emails a recovery sends. */
    origin: string;
}

const SWITCH = 'ORDER_RECONCILER';

/**
 * Whether this server runs the ten-minute order reconciler, and with what.
 * Null only when `ORDER_RECONCILER=off`.
 *
 * On by default: nothing else expires a stale order, so a server that forgot
 * the variable would hold that stock forever without saying so. It was off by
 * default while Phoenix's `ExpiryWorker` swept the same database (two sweepers
 * could release one order's stock twice); that process was removed from
 * production on 2026-10-07. `off` remains for the e2e server, which runs the
 * sweep on demand, and for a second instance on one database.
 *
 * @example
 * const config = readOrderReconcilerConfig();
 * if (config) startOrderReconciler(container.orderReconciler, config);
 */
export function readOrderReconcilerConfig(): OrderReconcilerConfig | null {
    const raw = env[SWITCH] ?? 'on';
    if (raw !== 'on' && raw !== 'off') throw new Error(`${SWITCH} must be on | off, got: ${raw}`);
    if (raw === 'off') return null;
    const origin = env.ORIGIN;
    if (!origin?.startsWith('http')) {
        throw new Error(
            `ORIGIN is required unless ${SWITCH}=off (e.g. https://tickets.example.com), got: ${origin ?? '(unset)'}`
        );
    }
    return { origin: origin.replace(/\/$/, '') };
}
