import { requireUser } from '$lib/mock/auth';
import { ok, safe } from '$lib/mock/respond';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) =>
	safe(() => ok(requireUser(request)));
