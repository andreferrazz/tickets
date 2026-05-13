import { getState, nowIso, uid } from '$lib/mock/store';
import { err, ok, safe } from '$lib/mock/respond';
import type { Role, User } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	safe(async () => {
		const body = (await request.json()) as { email?: string; code?: string };
		const email = body.email?.trim().toLowerCase();
		const code = body.code?.trim();
		if (!email || !code || code.length !== 6) return err(400, 'email + 6-digit code required');

		const s = getState();
		// Mock auth accepts any 6-digit code as per PLAN, but consume stored code if present.
		s.authCodes.delete(email);

		let user = [...s.users.values()].find((u) => u.email === email);
		if (!user) {
			const pendingInvite = [...s.invitations.values()].find(
				(i) => i.email === email && i.status === 'pending'
			);
			const role: Role = pendingInvite ? 'creator' : 'buyer';
			user = {
				id: uid(),
				email,
				role,
				invited_by: pendingInvite?.inviter_id ?? null,
				created_at: nowIso()
			};
			s.users.set(user.id, user);
			if (pendingInvite) {
				pendingInvite.status = 'accepted';
			}
		}

		const token = uid().replace(/-/g, '') + uid().replace(/-/g, '');
		s.sessions.set(token, user.id);
		return ok({ token, user: user satisfies User });
	});
