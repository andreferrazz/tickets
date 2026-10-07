import { error, json, type RequestHandler } from '@sveltejs/kit';

/**
 * Test-only: runs the stale-order sweep now instead of on its ten-minute
 * timer, and answers with what it did. Does not exist outside
 * `INTEGRATIONS=fake`, which is itself refused in production.
 */
export const POST: RequestHandler = async ({ locals, url }) => {
    if (!locals.container.fakes) error(404, 'not found');
    return json(await locals.container.orderReconciler.run(url.origin));
};
