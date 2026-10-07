import type { APIRequestContext } from '@playwright/test';
import { parse } from 'devalue';

export interface ActionAnswer {
    /** `success`, `failure`, `redirect` or `error`, as SvelteKit names them. */
    type: string;
    /** What the action returned, or what it passed to `fail`. */
    data: Record<string, unknown>;
    /** Where a `redirect` answer points. */
    location: string | null;
}

/**
 * Posts a form action the way an enhanced form does and returns its answer.
 * For the refusals a page never lets a person reach: the server must hold the
 * line on its own.
 *
 * @example
 * const answer = await postFormAction(context.request, `/events/${id}?/buy`, { 'ticket:…': '2' });
 * expect(answer.data.error).toBe('out_of_stock');
 */
export async function postFormAction(
    request: APIRequestContext,
    path: string,
    form: Record<string, string>
): Promise<ActionAnswer> {
    const response = await request.post(path, {
        form,
        headers: { 'x-sveltekit-action': 'true' }
    });
    const body = (await response.json()) as { type: string; data?: string; location?: string };
    return {
        type: body.type,
        data: body.data ? (parse(body.data) as Record<string, unknown>) : {},
        location: body.location ?? null
    };
}
