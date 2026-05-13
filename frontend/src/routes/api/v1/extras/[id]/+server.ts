import { requireCreator } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState } from '$lib/mock/store';
import type { ExtraItem } from '$lib/types';
import type { RequestHandler } from './$types';

function authorize(id: string, userId: string, isAdmin: boolean) {
	const s = getState();
	const x = s.extras.get(id);
	if (!x) return { error: err(404, 'extra not found') } as const;
	const ev = s.events.get(x.event_id);
	if (!ev) return { error: err(404, 'event not found') } as const;
	if (ev.creator_id !== userId && !isAdmin) return { error: err(403, 'forbidden') } as const;
	return { extra: x };
}

export const PUT: RequestHandler = ({ params, request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const res = authorize(params.id, user.id, user.role === 'admin');
		if ('error' in res) return res.error;
		const body = (await request.json()) as Partial<ExtraItem>;
		const updated = { ...res.extra, ...body, id: res.extra.id, event_id: res.extra.event_id };
		getState().extras.set(updated.id, updated);
		return ok(updated);
	});

export const DELETE: RequestHandler = ({ params, request }) =>
	safe(() => {
		const user = requireCreator(request);
		const res = authorize(params.id, user.id, user.role === 'admin');
		if ('error' in res) return res.error;
		getState().extras.delete(params.id);
		return ok({ deleted: true });
	});
