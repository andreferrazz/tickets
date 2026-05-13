import { getState } from '$lib/mock/store';
import { ok, safe } from '$lib/mock/respond';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ request }) =>
	safe(() => {
		const auth = request.headers.get('authorization');
		if (auth?.startsWith('Bearer ')) {
			getState().sessions.delete(auth.slice('Bearer '.length));
		}
		return ok({ logged_out: true });
	});
