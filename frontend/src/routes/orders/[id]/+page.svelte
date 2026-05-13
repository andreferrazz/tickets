<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL, formatDate } from '$lib/api';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Order } from '$lib/types';
	import { onMount } from 'svelte';

	let order = $state<Order | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	const justPaid = $derived(page.url.searchParams.get('paid') === '1');

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		try {
			order = await api.getOrder(page.params.id!);
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('order.errorFallback');
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error || !order}
	<div class="error">{error ?? t('order.notFound')}</div>
{:else}
	<div class="head">
		<h1>{t('order.title')}</h1>
		<span class="badge {order.status}">{tStatus(order.status)}</span>
	</div>
	<p class="muted">{order.event_title} · {formatDate(order.created_at)}</p>

	{#if justPaid}
		<div class="notice">{t('order.paymentConfirmed')}</div>
	{/if}

	<div class="card stack" style="margin-top: 1rem;">
		<h3>{t('order.items')}</h3>
		{#each order.items as i (i.id)}
			<div class="line">
				<span>{i.item_name} × {i.quantity}</span>
				<span>{formatBRL(i.unit_price_cents * i.quantity)}</span>
			</div>
		{/each}
		<div class="total">
			<span>{t('common.total')}</span>
			<strong>{formatBRL(order.total_cents)}</strong>
		</div>
	</div>

	{#if order.status === 'pending' && order.abacate_payment_url}
		<div class="card" style="margin-top: 1rem;">
			<p>{t('order.awaitingPayment')}</p>
			<a href={order.abacate_payment_url} class="btn">{t('order.continueToPay')}</a>
		</div>
	{/if}

	{#if order.paid_at}
		<p class="muted" style="margin-top: 1rem;">{t('order.paidAt')} {formatDate(order.paid_at)}</p>
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
</style>
