<script lang="ts">
    import { applyAction, enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { invalidateAll } from '$app/navigation';
    import { formatBRL } from '$lib/api';
    import { t, tStatus } from '$lib/i18n';
    import { cancellationFailureMessage } from '$lib/modules/orders/checkout-messages';
    import { canBuyerCancel } from '$lib/modules/orders/policy';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const error = $derived(form?.error ? cancellationFailureMessage(form.error) : null);
    let cancellingId = $state<string | null>(null);

    // The list is re-read from the server rather than patched from the answer,
    // so there is one source of truth for what is shown.
    const submitCancel: SubmitFunction = async ({ formData, cancel }) => {
        const ok = await confirmDialog({
            message: t('order.cancelConfirm'),
            confirmText: t('order.cancel'),
            danger: true
        });
        if (!ok) return cancel();
        cancellingId = String(formData.get('order_id'));
        return async ({ result }) => {
            cancellingId = null;
            await applyAction(result);
            await invalidateAll();
        };
    };
</script>

<h1>{t('orders.title')}</h1>

{#if error}
    <div class="error">{error}</div>
{/if}

{#if data.loadFailed}
    <div class="error">{t('orders.errorFallback')}</div>
{:else if data.orders.length === 0}
    <p class="muted">{t('orders.empty')} <a href={resolve('/')}>{t('orders.browseEvents')}</a>.</p>
{:else}
    <div class="stack">
        {#each data.orders as o (o.id)}
            <div class="order-row">
                <a href={resolve('/orders/[id]', { id: o.id })} class="order">
                    <div>
                        <strong>{o.eventTitle}</strong>
                        <div class="muted small">{formatDateTime(o.createdAt)}</div>
                    </div>
                    <div class="right">
                        <span class="badge {o.status}">{tStatus(o.status)}</span>
                        <div>{formatBRL(o.totalCents)}</div>
                    </div>
                </a>
                {#if canBuyerCancel(o)}
                    <form method="POST" action="?/cancel" use:enhance={submitCancel}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <button class="cancel" disabled={cancellingId !== null}>
                            {cancellingId === o.id ? t('order.cancelling') : t('order.cancel')}
                        </button>
                    </form>
                {/if}
            </div>
        {/each}
    </div>
{/if}

<style>
    .order-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .order-row form {
        align-self: flex-end;
    }
    .cancel {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
        font-weight: 500;
        background: transparent;
        color: var(--danger);
    }
    .cancel:hover:not(:disabled) {
        background: var(--tone-error-bg);
    }
    .order {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text);
    }
    .order:hover {
        border-color: var(--accent);
    }
    .right {
        text-align: right;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    .small {
        font-size: 0.85rem;
    }
</style>
