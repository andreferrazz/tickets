import type { Queryable } from '$lib/db/queryable';

/**
 * The audit log of inbound webhooks, as `Backend.Webhooks.log_event/1` kept
 * it: every verified delivery, before it is acted on, so a payment that failed
 * to process can be found and replayed.
 *
 * @example
 * await webhookLog.record('checkout.completed', payload);
 */
export interface WebhookLogRepository {
    record(eventType: string | null, payload: unknown): Promise<void>;
}

// The width of `webhook_events.event_type`; a longer name must not lose the row.
const EVENT_TYPE_MAX = 50;

export function getWebhookLogRepository({
    queryable
}: {
    queryable: Queryable;
}): WebhookLogRepository {
    return {
        async record(eventType, payload) {
            const sql = `
                insert into webhook_events (event_type, payload, inserted_at, updated_at)
                values ($1, $2::jsonb, now() at time zone 'utc', now() at time zone 'utc')`;
            const type = eventType?.slice(0, EVENT_TYPE_MAX) ?? null;
            await queryable.query(sql, [type, JSON.stringify(payload)]);
        }
    };
}
