import { requireCreator, requireUser } from '$lib/mock/auth';
import { listPublishedEvents } from '$lib/mock/events';
import { ok, safe } from '$lib/mock/respond';
import { getState, nowIso, uid } from '$lib/mock/store';
import type { Event } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) =>
	safe(() => {
		requireUser(request);
		return ok(listPublishedEvents());
	});

interface CreateEventBody {
	title?: string;
	description?: string;
	location?: string;
	starts_at?: string;
	ends_at?: string | null;
	cover_image_url?: string | null;
	status?: 'draft' | 'published';
}

export const POST: RequestHandler = ({ request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const body = (await request.json()) as CreateEventBody;
		if (!body.title || !body.starts_at) {
			return ok({ error: 'title and starts_at required' }, 400);
		}
		const ev: Event = {
			id: uid(),
			creator_id: user.id,
			title: body.title,
			description: body.description ?? '',
			location: body.location ?? '',
			starts_at: body.starts_at,
			ends_at: body.ends_at ?? null,
			cover_image_url: body.cover_image_url ?? null,
			status: body.status ?? 'draft',
			created_at: nowIso(),
			updated_at: nowIso()
		};
		getState().events.set(ev.id, ev);
		return ok(ev, 201);
	});
