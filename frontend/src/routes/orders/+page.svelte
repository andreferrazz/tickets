<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { api, ApiError, formatBRL } from '$lib/api';
    import { t, tStatus } from '$lib/i18n';
    import { canBuyerCancel } from '$lib/modules/orders/policy';
    import type { OrderDto } from '$lib/modules/orders/types';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let error = $state<string | null>(null);
    let cancellingId = $state<string | null>(null);

    // Cancellation still goes through Phoenix until the orders step of the
    // migration; the list is then re-read from the server rather than patched
    // from the response, so there is one source of truth for what is shown.
    async function cancelOrder(order: OrderDto) {
        if (cancellingId) return;
        const ok = await confirmDialog({
            message: t('order.cancelConfirm'),
            confirmText: t('order.cancel'),
            danger: true
        });
        if (!ok) return;
        cancellingId = order.id;
        error = null;
        try {
            await api.cancelOrder(order.id);
            await invalidateAll();
        } catch (e) {
            error = e instanceof ApiError ? e.message : t('order.cancelError');
        } finally {
            cancellingId = null;
        }
    }
</script>

<h1>{t('orders.title')}</h1>

{#if error}
    <div class="error">{error}</div>
{/if}

{#if data.loadFailed}
    <div class="error">{t('orders.errorFallback')}</div>
{:else if data.orders.length === 0}
    <p class="muted">{t('orders.empty')} <a href="/">{t('orders.browseEvents')}</a>.</p>
{:else}
    <div class="stack">
        {#each data.orders as o (o.id)}
            <div class="order-row">
                <a href="/orders/{o.id}" class="order">
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
                    <button
                        class="cancel"
                        onclick={() => cancelOrder(o)}
                        disabled={cancellingId === o.id}
                    >
                        {cancellingId === o.id ? t('order.cancelling') : t('order.cancel')}
                    </button>
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
    .cancel {
        align-self: flex-end;
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
