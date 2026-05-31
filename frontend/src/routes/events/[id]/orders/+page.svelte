<script lang="ts">
	import { page } from '$app/state';
	import { formatBRL } from '$lib/api';
	import { formatDateTime } from '$lib/datetime';
	import { t } from '$lib/i18n';

	type PaymentMethod = 'CARTAO' | 'PIX';

	type OrderItem = {
		name: string;
		quantity: number;
		unit_price_cents: number;
	};

	type OrderRow = {
		id: string;
		buyer_name: string;
		buyer_email: string;
		buyer_phone: string;
		total_cents: number;
		payment_method: PaymentMethod;
		paid_at: string;
		tickets: OrderItem[];
		extras: OrderItem[];
	};

	const orders: OrderRow[] = [
		{
			id: '1',
			buyer_name: 'Ana Souza',
			buyer_email: 'ana.souza@example.com',
			buyer_phone: '(11) 91234-5678',
			total_cents: 12000,
			payment_method: 'PIX',
			paid_at: '2026-05-30T14:23:00Z',
			tickets: [{ name: 'Pista · 1º Lote', quantity: 1, unit_price_cents: 10000 }],
			extras: [{ name: 'Camiseta', quantity: 1, unit_price_cents: 2000 }]
		},
		{
			id: '2',
			buyer_name: 'Bruno Lima',
			buyer_email: 'bruno.lima@example.com',
			buyer_phone: '(21) 99876-5432',
			total_cents: 24000,
			payment_method: 'CARTAO',
			paid_at: '2026-05-29T19:05:00Z',
			tickets: [{ name: 'Pista · 2º Lote', quantity: 2, unit_price_cents: 12000 }],
			extras: []
		},
		{
			id: '3',
			buyer_name: 'Carla Mendes',
			buyer_email: 'carla.mendes@example.com',
			buyer_phone: '(31) 98765-4321',
			total_cents: 9000,
			payment_method: 'PIX',
			paid_at: '2026-05-28T10:42:00Z',
			tickets: [{ name: 'Meia-entrada', quantity: 1, unit_price_cents: 6000 }],
			extras: [{ name: 'Caneca', quantity: 1, unit_price_cents: 3000 }]
		},
		{
			id: '4',
			buyer_name: 'Diego Rocha',
			buyer_email: 'diego.rocha@example.com',
			buyer_phone: '(41) 91111-2222',
			total_cents: 36000,
			payment_method: 'CARTAO',
			paid_at: '2026-05-27T08:11:00Z',
			tickets: [{ name: 'VIP', quantity: 1, unit_price_cents: 30000 }],
			extras: [{ name: 'Bebida', quantity: 2, unit_price_cents: 3000 }]
		}
	];

	let selected = $state<OrderRow | null>(null);

	function onRowKey(e: KeyboardEvent, o: OrderRow) {
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
	<h1>{t('orders.title')}</h1>
	<a href="/events/{page.params.id}/dashboard" class="btn secondary small">←</a>
</header>

<div class="card table-wrap">
	<table class="orders">
		<thead>
			<tr>
				<th>{t('orders.columnName')}</th>
				<th>{t('orders.columnValue')}</th>
				<th>{t('orders.columnPaymentMethod')}</th>
				<th>{t('orders.columnPaidAt')}</th>
			</tr>
		</thead>
		<tbody>
			{#each orders as o (o.id)}
				<tr
					class="clickable"
					role="button"
					tabindex="0"
					onclick={() => (selected = o)}
					onkeydown={(e) => onRowKey(e, o)}
				>
					<td>{o.buyer_name}</td>
					<td>{formatBRL(o.total_cents)}</td>
					<td>{o.payment_method}</td>
					<td>{formatDateTime(o.paid_at)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if selected}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
			<div class="dialog-head">
				<h3 id="order-details-title">{t('orders.detailsTitle')}</h3>
				<button type="button" class="secondary small" onclick={() => (selected = null)}>
					{t('dashboard.close')}
				</button>
			</div>

			<dl class="summary">
				<dt>{t('orders.columnName')}</dt>
				<dd>{selected.buyer_name}</dd>
				<dt>{t('orders.email')}</dt>
				<dd>{selected.buyer_email}</dd>
				<dt>{t('orders.phone')}</dt>
				<dd>{selected.buyer_phone}</dd>
				<dt>{t('orders.columnValue')}</dt>
				<dd>{formatBRL(selected.total_cents)}</dd>
				<dt>{t('orders.columnPaymentMethod')}</dt>
				<dd>{selected.payment_method}</dd>
				<dt>{t('orders.columnPaidAt')}</dt>
				<dd>{formatDateTime(selected.paid_at)}</dd>
			</dl>

			<section class="items">
				<h4>{t('orders.tickets')}</h4>
				{#if selected.tickets.length === 0}
					<p class="muted">{t('orders.noTickets')}</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>{t('orders.columnName')}</th>
								<th class="num-col">{t('orders.itemQty')}</th>
								<th class="num-col">{t('orders.itemPrice')}</th>
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
				<h4>{t('orders.extras')}</h4>
				{#if selected.extras.length === 0}
					<p class="muted">{t('orders.noExtras')}</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>{t('orders.columnName')}</th>
								<th class="num-col">{t('orders.itemQty')}</th>
								<th class="num-col">{t('orders.itemPrice')}</th>
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
</style>
