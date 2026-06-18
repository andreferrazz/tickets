<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { EventOrder, EventOrderLine, OrderStatus, PaymentMethod } from '$lib/types';
	import { onMount } from 'svelte';

	let orders = $state<EventOrder[] | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selected = $state<EventOrder | null>(null);

	// Statuses offered in the filter; paid is the only one selected by default.
	const statusOptions: OrderStatus[] = ['paid', 'pending', 'expired'];
	let query = $state('');
	let statuses = $state<OrderStatus[]>(['paid']);

	const filtered = $derived(
		(orders ?? []).filter((o) => {
			if (!statuses.includes(o.status)) return false;
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return (o.buyer_name ?? o.buyer_email).toLowerCase().includes(q);
		})
	);

	const lineSum = (lines: EventOrderLine[]) =>
		lines.reduce((acc, l) => acc + l.quantity, 0);

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto(`/auth/login?next=/events/${page.params.id}/orders`);
			return;
		}
		try {
			// Fetch every status; the paid/not-paid toggle filters client-side.
			orders = await api.listEventOrders(page.params.id!, []);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				error = t('eventOrders.notAuthorized');
			} else {
				error = e instanceof ApiError ? e.message : t('eventOrders.errorFallback');
			}
		} finally {
			loading = false;
		}
	});

	function paymentMethodLabel(method: PaymentMethod | null): string {
		switch (method) {
			case 'PIX':
				return t('eventOrders.paymentMethod.PIX');
			case 'CARD':
				return t('eventOrders.paymentMethod.CARD');
			case 'BOLETO':
				return t('eventOrders.paymentMethod.BOLETO');
			default:
				return t('eventOrders.unknown');
		}
	}

	function onRowKey(e: KeyboardEvent, o: EventOrder) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selected = o;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (selected && e.key === 'Escape') selected = null;
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) selected = null;
	}
</script>

<svelte:window on:keydown={onKeydown} />

<header class="head">
	<h1>{t('eventOrders.title')}</h1>
	<a href="/events/{page.params.id}/dashboard" class="btn secondary small">←</a>
</header>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else if !orders || orders.length === 0}
	<p class="muted">{t('eventOrders.empty')}</p>
{:else}
	<div class="filters">
		<input
			class="search"
			placeholder={t('eventOrders.searchPlaceholder')}
			bind:value={query}
		/>
		<fieldset class="status-filter">
			<legend>{t('eventOrders.filterStatus')}</legend>
			{#each statusOptions as s (s)}
				<label class="check">
					<input type="checkbox" value={s} bind:group={statuses} />
					{tStatus(s)}
				</label>
			{/each}
		</fieldset>
	</div>

	{#if filtered.length === 0}
		<p class="muted">{t('eventOrders.noResults')}</p>
	{:else}
		<div class="card table-wrap">
			<table class="orders">
				<thead>
					<tr>
						<th>{t('eventOrders.columnName')}</th>
						<th class="num-col">
							{t('eventOrders.columnTickets')}
							<button
								type="button"
								class="help"
								title={t('eventOrders.columnTicketsHelp')}
								aria-label={t('eventOrders.columnTicketsHelp')}>?</button
							>
						</th>
						<th>{t('common.status')}</th>
						<th class="col-detail">{t('eventOrders.columnValue')}</th>
						<th class="col-detail">{t('eventOrders.columnPaymentMethod')}</th>
						<th class="col-detail">{t('eventOrders.columnPaidAt')}</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as o (o.id)}
						<tr
							class="clickable"
							role="button"
							tabindex="0"
							onclick={() => (selected = o)}
							onkeydown={(e) => onRowKey(e, o)}
						>
							<td class="name-cell">{o.buyer_name ?? o.buyer_email}</td>
							<td class="num-col">{o.validated_count}/{lineSum(o.tickets)}</td>
							<td><span class="badge {o.status}">{tStatus(o.status)}</span></td>
							<td class="col-detail">{formatBRL(o.total_cents)}</td>
							<td class="col-detail">{paymentMethodLabel(o.payment_method)}</td>
							<td class="col-detail"
								>{o.paid_at ? formatDateTime(o.paid_at) : t('eventOrders.unknown')}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

{#if selected}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
			<div class="dialog-head">
				<h3 id="order-details-title">{t('eventOrders.detailsTitle')}</h3>
				<button type="button" class="secondary small" onclick={() => (selected = null)}>
					{t('dashboard.close')}
				</button>
			</div>

			<dl class="summary">
				<dt>{t('common.status')}</dt>
				<dd><span class="badge {selected.status}">{tStatus(selected.status)}</span></dd>
				<dt>{t('eventOrders.columnName')}</dt>
				<dd>{selected.buyer_name ?? t('eventOrders.unknown')}</dd>
				<dt>{t('eventOrders.email')}</dt>
				<dd>{selected.buyer_email}</dd>
				<dt>{t('eventOrders.phone')}</dt>
				<dd>{selected.buyer_phone ?? t('eventOrders.unknown')}</dd>
				<dt>{t('eventOrders.columnValue')}</dt>
				<dd>{formatBRL(selected.total_cents)}</dd>
				<dt>{t('eventOrders.columnPaymentMethod')}</dt>
				<dd>{paymentMethodLabel(selected.payment_method)}</dd>
				<dt>{t('eventOrders.columnPaidAt')}</dt>
				<dd>{selected.paid_at ? formatDateTime(selected.paid_at) : t('eventOrders.unknown')}</dd>
			</dl>

			<section class="items">
				<h4>{t('eventOrders.tickets')}</h4>
				{#if selected.tickets.length === 0}
					<p class="muted">{t('eventOrders.noTickets')}</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>{t('eventOrders.columnName')}</th>
								<th class="num-col">{t('eventOrders.itemQty')}</th>
								<th class="num-col">{t('eventOrders.itemPrice')}</th>
							</tr>
						</thead>
						<tbody>
							{#each selected.tickets as it, i (i)}
								<tr>
									<td>{it.name}</td>
									<td class="num-col">{it.quantity}</td>
									<td class="num-col">{formatBRL(it.unit_price_cents)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>

			<section class="items">
				<h4>{t('eventOrders.extras')}</h4>
				{#if selected.extras.length === 0}
					<p class="muted">{t('eventOrders.noExtras')}</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>{t('eventOrders.columnName')}</th>
								<th class="num-col">{t('eventOrders.itemQty')}</th>
								<th class="num-col">{t('eventOrders.itemPrice')}</th>
							</tr>
						</thead>
						<tbody>
							{#each selected.extras as it, i (i)}
								<tr>
									<td>{it.name}</td>
									<td class="num-col">{it.quantity}</td>
									<td class="num-col">{formatBRL(it.unit_price_cents)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1rem 0 1.5rem;
	}
	.filters {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 1rem;
	}
	.filters .search {
		flex: 1 1 16rem;
		width: auto;
	}
	.status-filter {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.4rem 0.75rem;
		margin: 0;
	}
	.status-filter legend {
		padding: 0 0.35rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
	}
	.check input {
		width: auto;
	}
	.table-wrap {
		overflow-x: auto;
		padding: 0;
	}
	.orders {
		width: 100%;
		border-collapse: collapse;
	}
	.orders th,
	.orders td {
		text-align: left;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--surface-2);
	}
	.orders thead th {
		font-size: 0.85rem;
		color: var(--muted, inherit);
		font-weight: 600;
	}
	.orders tbody tr:last-child td {
		border-bottom: none;
	}
	.clickable {
		cursor: pointer;
	}
	.clickable:hover {
		background: var(--surface-2);
	}
	.clickable:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}
	.dialog {
		max-width: 640px;
		width: 100%;
		max-height: 85vh;
		overflow: auto;
		background: var(--surface);
	}
	.dialog-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		gap: 1rem;
	}
	.dialog-head h3 {
		margin: 0;
	}
	.summary {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1rem;
		margin: 0 0 1rem;
	}
	.summary dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.summary dd {
		margin: 0;
	}
	.items {
		margin-top: 1rem;
	}
	.items h4 {
		margin: 0 0 0.5rem;
	}
	.items table {
		width: 100%;
		border-collapse: collapse;
	}
	.items th,
	.items td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
	}
	.items th {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 600;
	}
	.num-col {
		text-align: right;
	}
	/* Cap long buyer names so one outlier can't stretch the table. */
	.name-cell {
		max-width: 30ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Inline "?" affordance carrying the column's explanatory tooltip. */
	.help {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		background: none;
		border: 1px solid var(--border);
		border-radius: 50%;
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1;
		color: var(--muted);
		cursor: help;
		user-select: none;
	}
	.help:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@media (max-width: 640px) {
		.col-detail {
			display: none;
		}
		.status-filter {
			flex-basis: 100%;
		}
		/* Tighter cap on narrow screens; truncation rules come from the base. */
		.name-cell {
			max-width: 12ch;
		}
	}
</style>
