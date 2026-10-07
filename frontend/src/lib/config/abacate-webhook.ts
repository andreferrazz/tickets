import { env } from '$env/dynamic/private';

/**
 * The per-seller secret Abacate Pay appends to the webhook URL as
 * `?webhookSecret=`. Empty when `ABACATE_PAY_WEBHOOK_SECRET` is unset, and the
 * endpoint then refuses every delivery. Deliberately not required at boot: a
 * local or e2e server takes no real deliveries and runs without the variable.
 *
 * @example
 * const secret = readAbacateWebhookSecret(); // '' until the variable is set
 */
export function readAbacateWebhookSecret(): string {
    return env.ABACATE_PAY_WEBHOOK_SECRET ?? '';
}
