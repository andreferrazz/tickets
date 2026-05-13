import { getState } from '$lib/mock/store';
import { err, ok, safe } from '$lib/mock/respond';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	safe(async () => {
		const body = (await request.json()) as { email?: string };
		const email = body.email?.trim().toLowerCase();
		if (!email || !email.includes('@')) return err(400, 'valid email required');
		const code = String(Math.floor(100000 + Math.random() * 900000));
		const s = getState();
		s.authCodes.set(email, { code, expires_at: Date.now() + 10 * 60_000 });
		// In mock mode, return the code so the UX can hint it.
		return ok({ sent: true, mock_code: code });
	});
