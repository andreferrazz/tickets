import { requireUser } from '$lib/mock/auth';
import { err, ok, safe } from '$lib/mock/respond';
import { getState, nowIso, uid } from '$lib/mock/store';
import type { CartLine, Order, OrderItem } from '$lib/types';
import type { RequestHandler } from './$types';

interface CreateOrderBody {
	event_id?: string;
	items?: CartLine[];
}

export const GET: RequestHandler = ({ request }) =>
	safe(() => {
		const user = requireUser(request);
		const orders = [...getState().orders.values()]
			.filter((o) => o.user_id === user.id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return ok(orders);
	});

export const POST: RequestHandler = ({ request, url }) =>
	safe(async () => {
		const user = requireUser(request);
		const body = (await request.json()) as CreateOrderBody;
		if (!body.event_id || !body.items?.length) return err(400, 'event_id and items required');
		const s = getState();
		const ev = s.events.get(body.event_id);
		if (!ev) return err(404, 'event not found');

		const orderId = uid();
		const items: OrderItem[] = [];
		let total = 0;

		for (const line of body.items) {
			if (line.quantity <= 0) continue;
			if (line.item_type === 'ticket') {
				const tt = s.ticketTypes.get(line.item_id);
				if (!tt || tt.event_id !== ev.id) return err(400, 'invalid ticket');
				const available = tt.quantity_total - tt.quantity_sold;
				if (available < line.quantity) return err(409, `out of stock: ${tt.name}`);
				tt.quantity_sold += line.quantity;
				items.push({
					id: uid(),
					order_id: orderId,
					item_type: 'ticket',
					item_id: tt.id,
					item_name: tt.name,
					quantity: line.quantity,
					unit_price_cents: tt.price_cents
				});
				total += tt.price_cents * line.quantity;
			} else {
				const x = s.extras.get(line.item_id);
				if (!x || x.event_id !== ev.id) return err(400, 'invalid extra');
				if (x.quantity_total !== null && x.quantity_total - x.quantity_sold < line.quantity) {
					return err(409, `out of stock: ${x.name}`);
				}
				x.quantity_sold += line.quantity;
				items.push({
					id: uid(),
					order_id: orderId,
					item_type: 'extra',
					item_id: x.id,
					item_name: x.name,
					quantity: line.quantity,
					unit_price_cents: x.price_cents
				});
				total += x.price_cents * line.quantity;
			}
		}

		if (!items.length) return err(400, 'no items');

		const payUrl = `${url.origin}/fake-pay/${orderId}`;
		const order: Order = {
			id: orderId,
			user_id: user.id,
			event_id: ev.id,
			event_title: ev.title,
			status: 'pending',
			total_cents: total,
			abacate_payment_url: payUrl,
			paid_at: null,
			created_at: nowIso(),
			items
		};
		s.orders.set(orderId, order);
		return ok(order, 201);
	});
