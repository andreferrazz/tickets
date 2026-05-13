import { requireCreator, requireUser } from '$lib/mock/auth';
import { eventDetail } from '$lib/mock/events';
import { err, ok, safe } from '$lib/mock/respond';
import { getState, nowIso } from '$lib/mock/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) =>
	safe(() => {
		requireUser(request);
		const ev = getState().events.get(params.id);
		if (!ev) return err(404, 'event not found');
		return ok(eventDetail(ev));
	});

export const PUT: RequestHandler = ({ params, request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const s = getState();
		const ev = s.events.get(params.id);
		if (!ev) return err(404, 'event not found');
		if (ev.creator_id !== user.id && user.role !== 'admin') {
			return err(403, 'only owner can edit');
		}
		const body = (await request.json()) as Partial<typeof ev>;
		const updated = { ...ev, ...body, id: ev.id, creator_id: ev.creator_id, updated_at: nowIso() };
		s.events.set(updated.id, updated);
		return ok(updated);
	});

export const DELETE: RequestHandler = ({ params, request }) =>
	safe(() => {
		const user = requireCreator(request);
		const s = getState();
		const ev = s.events.get(params.id);
		if (!ev) return err(404, 'event not found');
		if (ev.creator_id !== user.id && user.role !== 'admin') {
			return err(403, 'only owner can delete');
		}
		s.events.delete(params.id);
		return ok({ deleted: true });
	});
