<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError, formatBRL, isCancellable } from '$lib/api';
	import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
	import { formatDateTime } from '$lib/utils/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Order } from '$lib/types';
	import { onMount } from 'svelte';

	let orders = $state<Order[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let cancellingId = $state<string | null>(null);

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		try {
			orders = await api.listOrders();
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('orders.errorFallback');
		} finally {
			loading = false;
		}
	});

	async function cancelOrder(order: Order) {
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
			const updated = await api.cancelOrder(order.id);
			orders = orders.map((o) => (o.id === updated.id ? updated : o));
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('order.cancelError');
		} finally {
			cancellingId = null;
		}
	}
</script>

<h1>{t('orders.title')}</h1>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else if orders.length === 0}
	<p class="muted">{t('orders.empty')} <a href="/">{t('orders.browseEvents')}</a>.</p>
{:else}
	<div class="stack">
		{#each orders as o (o.id)}
			<div class="order-row">
				<a href="/orders/{o.id}" class="order">
					<div>
						<strong>{o.event_title}</strong>
						<div class="muted small">{formatDateTime(o.created_at)}</div>
					</div>
					<div class="right">
						<span class="badge {o.status}">{tStatus(o.status)}</span>
						<div>{formatBRL(o.total_cents)}</div>
					</div>
				</a>
				{#if isCancellable(o)}
					<button class="cancel" onclick={() => cancelOrder(o)} disabled={cancellingId === o.id}>
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
