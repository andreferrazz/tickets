import { env } from '$env/dynamic/private';

export interface OrderReconcilerConfig {
    /** The site's public origin, for the order links in the emails a recovery sends. */
    origin: string;
}

const SWITCH = 'ORDER_RECONCILER';

/**
 * Whether this server runs the ten-minute order reconciler, and with what.
 * Null unless `ORDER_RECONCILER=on`.
 *
 * Off by default because Phoenix's `ExpiryWorker` does the same job against
 * the same database until the cutover, and it releases stock without checking
 * that the order is still pending: two sweepers racing on one order would
 * release its stock twice. Turn this on in the deploy that stops Phoenix.
 *
 * @example
 * const config = readOrderReconcilerConfig();
 * if (config) startOrderReconciler(container.orderReconciler, config);
 */
export function readOrderReconcilerConfig(): OrderReconcilerConfig | null {
    const raw = env[SWITCH] ?? 'off';
    if (raw !== 'on' && raw !== 'off') throw new Error(`${SWITCH} must be on | off, got: ${raw}`);
    if (raw === 'off') return null;
    const origin = env.ORIGIN;
    if (!origin?.startsWith('http')) {
        throw new Error(
            `ORIGIN is required when ${SWITCH}=on (e.g. https://tickets.example.com), got: ${origin ?? '(unset)'}`
        );
    }
    return { origin: origin.replace(/\/$/, '') };
}
