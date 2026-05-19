<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError, formatBRL } from '$lib/api';
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Order } from '$lib/types';
	import { onMount } from 'svelte';

	let orders = $state<Order[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

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
		{/each}
	</div>
{/if}

<style>
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
