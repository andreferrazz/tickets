import { seedPerson } from './people';
import { queryRows } from './sql';
import { uniqueToken } from './unique';

export interface NewPass {
    eventId: string;
    /** An extras pass stands for the order's add-ons; these are its lines. */
    extras?: { name: string; quantity: number }[];
}

/**
 * A paid order by a fresh buyer on `eventId` with one unscanned pass; returns
 * the pass token, which is what its QR code encodes. Issuing passes belongs to
 * checkout, which has its own spec; scanning only needs one to exist.
 */
export async function seedPass(pass: NewPass): Promise<string> {
    const buyer = await seedPerson({ role: 'buyer' });
    const [{ id: orderId }] = await queryRows<{ id: string }>(
        `insert into orders (user_id, event_id, status, total_cents, paid_at, inserted_at, updated_at)
         values ($1, $2, 'paid', 0, now() at time zone 'utc', now() at time zone 'utc', now() at time zone 'utc')
         returning id`,
        [buyer.id, pass.eventId]
    );
    for (const line of pass.extras ?? []) {
        await queryRows(
            `insert into order_items (order_id, item_type, item_id, item_name, quantity, unit_price_cents, inserted_at)
             values ($1, 'extra', gen_random_uuid(), $2, $3, 0, now() at time zone 'utc')`,
            [orderId, line.name, line.quantity]
        );
    }
    const token = uniqueToken('e2e-pass');
    await queryRows(
        `insert into passes (token, kind, order_id, event_id, user_id, item_name, inserted_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, now() at time zone 'utc', now() at time zone 'utc')`,
        [
            token,
            pass.extras ? 'extra' : 'ticket',
            orderId,
            pass.eventId,
            buyer.id,
            pass.extras ? 'Extras' : 'E2E Pista'
        ]
    );
    return token;
}
