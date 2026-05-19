<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Order, Pass } from '$lib/types';
	import { onMount } from 'svelte';

	let order = $state<Order | null>(null);
	let passes = $state<Pass[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	const justPaid = $derived(page.url.searchParams.get('paid') === '1');
	const ticketPasses = $derived(passes.filter((p) => p.kind === 'ticket'));
	const extraPasses = $derived(passes.filter((p) => p.kind === 'extra'));

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		try {
			order = await api.getOrder(page.params.id!);
			if (order.paid_at) {
				passes = await api.getOrderPasses(page.params.id!);
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('order.errorFallback');
		} finally {
			loading = false;
		}
	});

	function passLabel(p: Pass): string {
		return p.kind === 'extra' ? t('order.passExtras') : p.item_name;
	}
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
	<p class="muted">{order.event_title} · {formatDateTime(order.created_at)}</p>

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
		<p class="muted" style="margin-top: 1rem;">{t('order.paidAt')} {formatDateTime(order.paid_at)}</p>
		<div class="notice" style="margin-top: 1rem;">{t('order.qrEmailed')}</div>

		{#if ticketPasses.length > 0}
			<div class="card stack" style="margin-top: 1rem;">
				<h3>{t('order.passesTicketsTitle')}</h3>
				<p class="muted">{t('order.passesHint')}</p>
				<div class="passes">
					{#each ticketPasses as p (p.id)}
						<div class="pass">
							<img
								src={`data:image/png;base64,${p.qr_png_base64}`}
								alt={passLabel(p)}
								width="220"
								height="220"
							/>
							<div class="pass-label">{passLabel(p)}</div>
							{#if p.seat_label}
								<div class="pass-seat">{p.seat_label}</div>
							{/if}
							{#if p.checked_in_at}
								<div class="pass-checked">
									{t('order.passCheckedIn')} · {formatDateTime(p.checked_in_at)}
								</div>
							{/if}
						</div>
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
						<div class="pass">
							<img
								src={`data:image/png;base64,${p.qr_png_base64}`}
								alt={passLabel(p)}
								width="220"
								height="220"
							/>
							<div class="pass-label">{passLabel(p)}</div>
							{#if p.checked_in_at}
								<div class="pass-checked">
									{t('order.passCheckedIn')} · {formatDateTime(p.checked_in_at)}
								</div>
							{/if}
						</div>
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
	.pass-seat {
		font-size: 0.9rem;
		color: var(--primary, #2255cc);
	}
	.pass-checked {
		font-size: 0.85rem;
		color: var(--muted, #888);
	}
</style>
