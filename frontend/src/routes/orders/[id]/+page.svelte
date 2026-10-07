<script lang="ts">
    import { applyAction, enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import { formatBRL } from '$lib/api';
    import { t, tStatus } from '$lib/i18n';
    import { cancellationFailureMessage } from '$lib/modules/orders/checkout-messages';
    import { canBuyerCancel } from '$lib/modules/orders/policy';
    import type { PassDto } from '$lib/modules/orders/types';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Server-rendered: an order that does not exist, or that this visitor did
    // not place, never reaches this component; the load function answers 404.
    const order = $derived(data.order);
    const ticketPasses = $derived(data.passes.filter((p) => p.kind === 'ticket'));
    const extraPasses = $derived(data.passes.filter((p) => p.kind === 'extra'));
    const justPaid = $derived(page.url.searchParams.get('paid') === '1');

    const error = $derived(form?.error ? cancellationFailureMessage(form.error) : null);
    let cancelling = $state(false);

    function passLabel(p: PassDto): string {
        return p.kind === 'extra' ? t('order.passExtras') : p.itemName;
    }

    // The order is re-read whatever the answer: a refusal can mean it was paid
    // in the meantime, and the page must then show the passes, not the button.
    const submitCancel: SubmitFunction = async ({ cancel }) => {
        const ok = await confirmDialog({
            message: t('order.cancelConfirm'),
            confirmText: t('order.cancel'),
            danger: true
        });
        if (!ok) return cancel();
        cancelling = true;
        return async ({ result }) => {
            cancelling = false;
            await applyAction(result);
            await invalidateAll();
        };
    };
</script>

{#snippet passCard(p: PassDto)}
    <div class="pass">
        <img
            src={`data:image/png;base64,${p.qrPngBase64}`}
            alt={passLabel(p)}
            width="220"
            height="220"
        />
        <div class="pass-label">{passLabel(p)}</div>
        {#if p.checkedInAt}
            <div class="pass-checked">
                {t('order.passCheckedIn')} · {formatDateTime(p.checkedInAt)}
            </div>
        {/if}
    </div>
{/snippet}

{#if data.loadFailed || !order}
    <div class="error">{t('order.errorFallback')}</div>
{:else}
    <div class="head">
        <h1>{t('order.title')}</h1>
        <span class="badge {order.status}">{tStatus(order.status)}</span>
    </div>
    <p class="muted">{order.eventTitle} · {formatDateTime(order.createdAt)}</p>

    {#if justPaid}
        <div class="notice">{t('order.paymentConfirmed')}</div>
    {/if}

    {#if error}
        <div class="error">{error}</div>
    {/if}

    <div class="card stack" style="margin-top: 1rem;">
        <h3>{t('order.items')}</h3>
        {#each order.items as i (i.id)}
            <div class="line">
                <span>{i.itemName} × {i.quantity}</span>
                <span>{formatBRL(i.unitPriceCents * i.quantity)}</span>
            </div>
        {/each}
        <div class="total">
            <span>{t('common.total')}</span>
            <strong>{formatBRL(order.totalCents)}</strong>
        </div>
    </div>

    {#if order.status === 'pending' && order.abacatePaymentUrl}
        <div class="card" style="margin-top: 1rem;">
            <p>{t('order.awaitingPayment')}</p>
            <a href={order.abacatePaymentUrl} class="btn">{t('order.continueToPay')}</a>
        </div>
    {/if}

    {#if canBuyerCancel(order)}
        <form method="POST" action="?/cancel" style="margin-top: 1rem;" use:enhance={submitCancel}>
            <button class="btn danger" disabled={cancelling}>
                {cancelling ? t('order.cancelling') : t('order.cancel')}
            </button>
        </form>
    {/if}

    {#if order.paidAt}
        <p class="muted" style="margin-top: 1rem;">
            {t('order.paidAt')}
            {formatDateTime(order.paidAt)}
        </p>
        <div class="notice" style="margin-top: 1rem;">{t('order.qrEmailed')}</div>

        {#if ticketPasses.length > 0}
            <div class="card stack" style="margin-top: 1rem;">
                <h3>{t('order.passesTicketsTitle')}</h3>
                <p class="muted">{t('order.passesHint')}</p>
                <div class="passes">
                    {#each ticketPasses as p (p.id)}
                        {@render passCard(p)}
                    {/each}
                </div>
            </div>
        {/if}

        {#if extraPasses.length > 0}
            <div class="card stack" style="margin-top: 1rem;">
                <h3>{t('order.passesExtrasTitle')}</h3>
                <p class="muted">{t('order.passesHint')}</p>
                <div class="passes">
                    {#each extraPasses as p (p.id)}
                        {@render passCard(p)}
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
{/if}

<style>
    .head {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .line {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0;
    }
    .total {
        display: flex;
        justify-content: space-between;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border);
        margin-top: 0.5rem;
    }
    .passes {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 1rem;
    }
    .pass {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #fff;
    }
    .pass img {
        display: block;
        width: 100%;
        height: auto;
    }
    .pass-label {
        font-weight: 600;
    }
    .pass-checked {
        font-size: 0.85rem;
        color: var(--muted, #888);
    }
</style>
