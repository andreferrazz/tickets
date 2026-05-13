import { requireCreator } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState, uid } from '$lib/mock/store';
import type { TicketType } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const s = getState();
		const ev = s.events.get(params.event_id);
		if (!ev) return err(404, 'event not found');
		if (ev.creator_id !== user.id && user.role !== 'admin') return err(403, 'forbidden');
		const body = (await request.json()) as Partial<TicketType>;
		const tt: TicketType = {
			id: uid(),
			event_id: ev.id,
			name: body.name ?? 'Ticket',
			description: body.description ?? '',
			price_cents: body.price_cents ?? 0,
			quantity_total: body.quantity_total ?? 0,
			quantity_sold: 0,
			sales_start: body.sales_start ?? null,
			sales_end: body.sales_end ?? null
		};
		s.ticketTypes.set(tt.id, tt);
		return ok(tt, 201);
	});
