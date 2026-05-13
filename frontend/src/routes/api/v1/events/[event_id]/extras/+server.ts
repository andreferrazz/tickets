import { requireCreator } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState, uid } from '$lib/mock/store';
import type { ExtraItem } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const s = getState();
		const ev = s.events.get(params.event_id);
		if (!ev) return err(404, 'event not found');
		if (ev.creator_id !== user.id && user.role !== 'admin') return err(403, 'forbidden');
		const body = (await request.json()) as Partial<ExtraItem>;
		const x: ExtraItem = {
			id: uid(),
			event_id: ev.id,
			name: body.name ?? 'Extra',
			description: body.description ?? '',
			price_cents: body.price_cents ?? 0,
			quantity_total: body.quantity_total ?? null,
			quantity_sold: 0
		};
		s.extras.set(x.id, x);
		return ok(x, 201);
	});
