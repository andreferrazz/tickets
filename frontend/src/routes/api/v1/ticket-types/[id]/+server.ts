import { requireCreator } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState } from '$lib/mock/store';
import type { TicketType } from '$lib/types';
import type { RequestHandler } from './$types';

function authorize(id: string, userId: string, isAdmin: boolean) {
	const s = getState();
	const tt = s.ticketTypes.get(id);
	if (!tt) return { error: err(404, 'ticket type not found') } as const;
	const ev = s.events.get(tt.event_id);
	if (!ev) return { error: err(404, 'event not found') } as const;
	if (ev.creator_id !== userId && !isAdmin) return { error: err(403, 'forbidden') } as const;
	return { tt };
}

export const PUT: RequestHandler = ({ params, request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const res = authorize(params.id, user.id, user.role === 'admin');
		if ('error' in res) return res.error;
		const body = (await request.json()) as Partial<TicketType>;
		const updated = { ...res.tt, ...body, id: res.tt.id, event_id: res.tt.event_id };
		getState().ticketTypes.set(updated.id, updated);
		return ok(updated);
	});

export const DELETE: RequestHandler = ({ params, request }) =>
	safe(() => {
		const user = requireCreator(request);
		const res = authorize(params.id, user.id, user.role === 'admin');
		if ('error' in res) return res.error;
		getState().ticketTypes.delete(params.id);
		return ok({ deleted: true });
	});
