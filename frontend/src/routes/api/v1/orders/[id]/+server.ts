import { requireUser } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState } from '$lib/mock/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) =>
	safe(() => {
		const user = requireUser(request);
		const order = getState().orders.get(params.id);
		if (!order) return err(404, 'order not found');
		if (order.user_id !== user.id && user.role !== 'admin') return err(403, 'forbidden');
		return ok(order);
	});
