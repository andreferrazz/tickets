<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import BuyerModal, { type BuyerTarget } from '$lib/components/BuyerModal.svelte';
	import WithdrawModal from '$lib/components/WithdrawModal.svelte';
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { EventStats } from '$lib/types';
	import { onMount } from 'svelte';

	let stats = $state<EventStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let buyerTarget = $state<BuyerTarget | null>(null);
	let withdrawOpen = $state(false);

	async function refreshStats() {
		stats = await api.getEventStats(page.params.id!);
	}

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto(`/auth/login?next=/events/${page.params.id}/dashboard`);
			return;
		}
		try {
			stats = await api.getEventStats(page.params.id!);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				error = t('dashboard.notAuthorized');
			} else {
				error = e instanceof ApiError ? e.message : t('dashboard.errorFallback');
			}
		} finally {
			loading = false;
		}
	});

	function pct(sold: number, capacity: number | null): number {
		if (!capacity || capacity <= 0) return 0;
		return Math.min(100, Math.round((sold / capacity) * 100));
	}
	
	function openBuyers(target: BuyerTarget) {
		buyerTarget = target;
	}

	function onTicketCardKey(e: KeyboardEvent, ttId: string, ttName: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openBuyers({ kind: 'ticket', id: ttId, name: ttName });
		}
	}
</script>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error || !stats}
	<div class="error">{error ?? t('dashboard.errorFallback')}</div>
{:else}
	<header class="head">
		<h1>{t('dashboard.title')}</h1>
		<a href="/events/{stats.event_id}" class="btn secondary small">←</a>
	</header>

	<section class="kpis">
		<div class="card kpi">
			<div class="muted small">{t('dashboard.revenue')}</div>
			<strong class="big">{formatBRL(stats.totals.revenue_cents)}</strong>
			<div class="muted small">{t('dashboard.revenueHint')}</div>
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.netRevenue')}</div>
			<strong class="big">{formatBRL(stats.totals.net_revenue_cents)}</strong>
			<div class="muted small">
				{t('dashboard.feesDeducted', { amount: formatBRL(stats.totals.fees_cents) })}
			</div>
			<div class="muted small">{t('dashboard.netRevenueHint')}</div>
			{#if stats.can_withdraw}
				<button type="button" class="btn small withdraw-btn" onclick={() => (withdrawOpen = true)}>
					{t('dashboard.withdraw')}
				</button>
			{/if}
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.ticketsReserved')}</div>
			<strong class="big">
				{stats.totals.tickets_sold}<span class="muted">/{stats.totals.tickets_capacity}</span>
			</strong>
			<div class="bar">
				<div
					class="bar-fill"
					style="width: {pct(stats.totals.tickets_sold, stats.totals.tickets_capacity)}%"
				></div>
			</div>
			<div class="muted small">{t('dashboard.ticketsReservedHint')}</div>
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.extrasSold')}</div>
			<strong class="big">{stats.totals.extras_sold}</strong>
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.checkIns')}</div>
			<strong class="big">
				{stats.totals.passes_checked_in}<span class="muted">/{stats.totals.passes_issued}</span>
			</strong>
			<div class="bar">
				<div
					class="bar-fill"
					style="width: {pct(stats.totals.passes_checked_in, stats.totals.passes_issued)}%"
				></div>
			</div>
			<div class="muted small">{t('dashboard.checkInsHint')}</div>
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.ordersPaid')}</div>
			<strong class="big">{stats.totals.orders_paid}</strong>
			<a href="/events/{stats.event_id}/orders" class="btn small view-orders-btn">
				{t('dashboard.viewOrders')}
			</a>
		</div>
		<div class="card kpi">
			<div class="muted small">{t('dashboard.ordersPending')}</div>
			<strong class="big">{stats.totals.orders_pending}</strong>
		</div>
	</section>

	<section class="block">
		<h2>{t('dashboard.byTicketType')}</h2>
		{#if stats.ticket_types.length === 0}
			<p class="muted">{t('dashboard.noTicketTypes')}</p>
		{:else}
			<div class="stack">
				{#each stats.ticket_types as tt (tt.id)}
					<div
						class="card ticket-row"
						role="button"
						tabindex="0"
						onclick={() => openBuyers({ kind: 'ticket', id: tt.id, name: tt.name })}
						onkeydown={(e) => onTicketCardKey(e, tt.id, tt.name)}
					>
						<div class="row-between">
							<div>
								<strong>{tt.name}</strong>
								<div class="muted small">
									{tt.sold}/{tt.capacity} · {formatBRL(tt.revenue_cents)}
								</div>
							</div>
							<div class="bar wide">
								<div class="bar-fill" style="width: {pct(tt.sold, tt.capacity)}%"></div>
							</div>
						</div>
						{#if tt.batches.length > 0}
							<ul class="batches">
								{#each tt.batches as b (b.id)}
									<li>
										<span class="badge">{b.label}</span>
										<span>{b.sold}/{b.capacity}</span>
										<span class="muted small">{formatBRL(b.price_cents)}</span>
										{#if b.closed_at}
											<span class="badge sold-out">{t('dashboard.closed')}</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#if stats.extras.length > 0}
		<section class="block">
			<h2>{t('dashboard.byExtra')}</h2>
			<div class="stack">
				{#each stats.extras as x (x.id)}
					<button
						type="button"
						class="card row-between extra-row"
						onclick={() => openBuyers({ kind: 'extra', id: x.id, name: x.name })}
					>
						<div>
							<strong>{x.name}</strong>
							<div class="muted small">{x.section_title}</div>
						</div>
						<div class="num">
							<div>
								{x.sold}{#if x.capacity !== null}/{x.capacity}{:else}
									<span class="muted small"> · {t('dashboard.unlimited')}</span>
								{/if}
							</div>
							<div class="muted small">{formatBRL(x.revenue_cents)}</div>
						</div>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<section class="block">
		<h2>{t('dashboard.recentOrders')}</h2>
		{#if stats.recent_orders.length === 0}
			<p class="muted">{t('dashboard.noOrdersYet')}</p>
		{:else}
			<div class="stack">
				{#each stats.recent_orders as o (o.id)}
					<div class="card row-between">
						<div>
							<strong>{o.buyer_email}</strong>
							<div class="muted small">
								{formatDateTime(o.created_at)} · {o.item_count} {t('dashboard.items')}
							</div>
						</div>
						<div class="num">
							<span class="badge {o.status}">{tStatus(o.status)}</span>
							<div>{formatBRL(o.total_cents)}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

{#if stats}
	<WithdrawModal
		eventId={stats.event_id}
		{stats}
		open={withdrawOpen}
		onClose={() => (withdrawOpen = false)}
		onChange={refreshStats}
	/>
{/if}
<BuyerModal target={buyerTarget} onClose={() => (buyerTarget = null)} />

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1rem 0 1.5rem;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}
	.kpi {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.big {
		font-size: 1.5rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.block {
		margin-top: 2rem;
	}
	.row-between {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.bar {
		height: 6px;
		background: var(--surface-2);
		border-radius: 999px;
		overflow: hidden;
		margin-top: 0.25rem;
	}
	.bar.wide {
		flex: 1;
		max-width: 240px;
	}
	.bar-fill {
		height: 100%;
		background: var(--accent);
	}
	.batches {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
		display: grid;
		gap: 0.4rem;
	}
	.batches li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.6rem;
		background: var(--surface-2);
		border-radius: var(--radius);
		font-size: 0.9rem;
	}
	.num {
		text-align: right;
	}
	.extra-row {
		display: flex;
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.extra-row:hover {
		background: var(--surface-2);
	}
	.ticket-row {
		cursor: pointer;
	}
	.ticket-row:hover {
		background: var(--surface-2);
	}
	.ticket-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.withdraw-btn {
		margin-top: 0.5rem;
		align-self: flex-start;
	}
	.view-orders-btn {
		margin-top: 0.5rem;
		align-self: flex-start;
	}
</style>
