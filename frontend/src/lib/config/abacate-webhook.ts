import { env } from '$env/dynamic/private';

/**
 * The per-seller secret Abacate Pay appends to the webhook URL as
 * `?webhookSecret=`. Empty when `ABACATE_PAY_WEBHOOK_SECRET` is unset, and the
 * endpoint then refuses every delivery. Deliberately not required at boot:
 * until the cutover the webhook is registered on the Phoenix host and this
 * app can run without the variable.
 *
 * @example
 * const secret = readAbacateWebhookSecret(); // '' until the variable is set
 */
export function readAbacateWebhookSecret(): string {
    return env.ABACATE_PAY_WEBHOOK_SECRET ?? '';
}
