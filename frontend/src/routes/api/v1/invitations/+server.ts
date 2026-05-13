import { requireCreator, requireUser } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState, nowIso, uid } from '$lib/mock/store';
import type { Invitation } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) =>
	safe(() => {
		const user = requireUser(request);
		const invs = [...getState().invitations.values()]
			.filter((i) => i.inviter_id === user.id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return ok(invs);
	});

export const POST: RequestHandler = ({ request }) =>
	safe(async () => {
		const user = requireCreator(request);
		const body = (await request.json()) as { email?: string };
		const email = body.email?.trim().toLowerCase();
		if (!email || !email.includes('@')) return err(400, 'valid email required');
		const inv: Invitation = {
			id: uid(),
			inviter_id: user.id,
			email,
			status: 'pending',
			created_at: nowIso()
		};
		getState().invitations.set(inv.id, inv);
		return ok(inv, 201);
	});
