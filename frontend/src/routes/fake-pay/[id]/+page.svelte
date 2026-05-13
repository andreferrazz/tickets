<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import { t } from '$lib/i18n';
	import type { Order } from '$lib/types';
	import { onMount } from 'svelte';

	let order = $state<Order | null>(null);
	let error = $state<string | null>(null);
	let countdown = $state(3);
	let timer: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		try {
			order = await api.getOrder(page.params.id!);
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('fakePay.errorFallback');
		}
	});

	async function pay() {
		if (!order) return;
		await api.mockComplete(order.id);
		await goto(`/orders/${order.id}?paid=1`);
	}

	function startAuto() {
		if (timer) return;
		timer = setInterval(async () => {
			countdown -= 1;
			if (countdown <= 0) {
				clearInterval(timer!);
				timer = null;
				await pay();
			}
		}, 1000);
	}
</script>

<div class="pay">
	<div class="card stack">
		<h1>{t('fakePay.title')}</h1>
		{#if error}
			<div class="error">{error}</div>
		{:else if order}
			<p class="muted">Pagar {formatBRL(order.total_cents)} via Pix</p>
			<div class="pix-box">
				<div class="qr">QR</div>
				<code class="muted small">PIX-{order.id.slice(0, 12)}-MOCK</code>
			</div>
			<button onclick={pay}>{t('fakePay.pay')}</button>
			<button class="secondary" onclick={startAuto} disabled={timer !== null}>
				{timer !== null
					? t('fakePay.autoCompleting', { n: countdown })
					: t('fakePay.autoComplete')}
			</button>
			<a href="/orders/{order.id}" class="muted small">{t('fakePay.cancel')}</a>
		{:else}
			<p class="muted">{t('common.loading')}</p>
		{/if}
	</div>
</div>

<style>
	.pay {
		max-width: 460px;
		margin: 2rem auto;
	}
	.pix-box {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
		padding: 1rem;
		background: var(--surface-2);
		border-radius: var(--radius);
	}
	.qr {
		width: 160px;
		height: 160px;
		background: repeating-conic-gradient(#000 0% 25%, #fff 0% 50%) 0 0/16px 16px;
		border-radius: 8px;
	}
	.small {
		font-size: 0.8rem;
	}
</style>
