import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * Payment events from Abacate Pay. No session: a delivery proves itself with
 * the secret in its URL and a signature over its body, both checked by the
 * webhook service. The body is read as text because that signature covers the
 * bytes as sent, not a re-serialised object.
 *
 * The path is the one Phoenix served, so moving the registration to this host
 * changes only the host.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
    const answer = await locals.container.abacateWebhook.receive({
        rawBody: await request.text(),
        urlSecret: url.searchParams.get('webhookSecret') ?? '',
        signature: request.headers.get('x-webhook-signature') ?? '',
        origin: url.origin
    });
    return json(answer.body, { status: answer.status });
};
