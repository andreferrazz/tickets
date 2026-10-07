import { t } from '$lib/i18n';
import type { TranslationKey } from '$lib/i18n/pt';

const PLACEMENT_MESSAGES: Record<string, TranslationKey> = {
    no_items: 'checkout.error.noItems',
    invalid_item: 'checkout.error.invalidItem',
    out_of_stock: 'checkout.error.outOfStock',
    extra_exceeds_tickets: 'event.errorExtraExceedsTickets',
    event_not_found: 'event.notFound',
    event_not_available: 'event.salesClosed',
    invalid_payment_method: 'checkout.error.paymentMethod',
    profile_incomplete: 'checkout.error.profileIncomplete',
    missing_product: 'checkout.error.unavailable',
    abacate_unavailable: 'checkout.error.unavailable'
};

const CANCELLATION_MESSAGES: Record<string, TranslationKey> = {
    not_found: 'order.cancelNotFound',
    not_cancellable: 'order.cancelNotCancellable',
    already_paid: 'order.cancelAlreadyPaid',
    payment_check_failed: 'order.cancelCheckFailed'
};

/**
 * What the buyer reads when the `buy` action refuses a cart. `itemName` is the
 * line a stock failure is about, when the action named one.
 *
 * @example
 * placementFailureMessage('out_of_stock', 'Pista'); // 'Esgotado: Pista'
 */
export function placementFailureMessage(code: string, itemName?: string | null): string {
    const message = t(PLACEMENT_MESSAGES[code] ?? 'checkout.error.fallback');
    return itemName && code === 'out_of_stock' ? `${message}: ${itemName}` : message;
}

/**
 * What the buyer or manager reads when a `cancel` action refuses.
 *
 * @example
 * cancellationFailureMessage('already_paid'); // 'Este pedido já foi pago...'
 */
export function cancellationFailureMessage(code: string): string {
    return t(CANCELLATION_MESSAGES[code] ?? 'order.cancelError');
}
