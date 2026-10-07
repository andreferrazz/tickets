import type { PaymentMethod } from '$lib/types';
import type { CartItemType, CartLine } from './checkout-types';
import type { CompRecipient } from './comp-service';

const CART_FIELD = /^(ticket|extra):(.+)$/;
const PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'CARD', 'BOLETO'];

/**
 * The form field that carries the quantity of one cart item. The event page
 * writes it and {@link parseCartForm} reads it back.
 *
 * @example
 * <input type="hidden" name={cartFieldName('ticket', ticketType.id)} value={2} />
 */
export function cartFieldName(type: CartItemType, itemId: string): string {
    return `${type}:${itemId}`;
}

/**
 * The cart a buy form submitted: every `ticket:<id>` and `extra:<id>` field
 * with a quantity. Blank and zero quantities are items the buyer left alone;
 * anything else is passed on for the resolver to accept or refuse.
 *
 * @example
 * const cart = parseCartForm(await request.formData());
 */
export function parseCartForm(form: FormData): CartLine[] {
    const lines: CartLine[] = [];
    for (const [field, value] of form.entries()) {
        const match = CART_FIELD.exec(field);
        if (!match || typeof value !== 'string' || value.trim() === '' || Number(value) === 0)
            continue;
        const itemType = match[1] as CartItemType;
        lines.push({ itemType, itemId: match[2], quantity: Number(value) });
    }
    return lines;
}

/**
 * The payment method a buy form chose: null when it chose none (a free cart
 * needs none), `'invalid'` for anything that is not a method.
 *
 * @example
 * const method = parsePaymentMethod(text(form, 'payment_method')); // 'PIX'
 */
export function parsePaymentMethod(raw: string): PaymentMethod | null | 'invalid' {
    if (raw === '') return null;
    return PAYMENT_METHODS.find((method) => method === raw) ?? 'invalid';
}

/**
 * The guest list of the comp form: its `email` and `quantity` fields, paired
 * by position. Rows left without an email are dropped.
 *
 * @example
 * const recipients = parseCompRecipients(await request.formData());
 */
export function parseCompRecipients(form: FormData): CompRecipient[] {
    const quantities = form.getAll('quantity');
    return form
        .getAll('email')
        .map((email, index) => ({
            email: typeof email === 'string' ? email.trim() : '',
            quantity: Number(quantities[index] ?? 1)
        }))
        .filter((recipient) => recipient.email !== '');
}
