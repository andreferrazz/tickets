<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL, formatDate } from '$lib/api';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { CartLine, EventDetail } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let buyError = $state<string | null>(null);
	let busy = $state(false);

	let qty = $state<Record<string, number>>({});

	const allExtras = $derived(event ? event.extra_sections.flatMap((s) => s.extras) : []);

	const lines = $derived.by(() => {
		if (!event) return [] as CartLine[];
		const out: CartLine[] = [];
		for (const t of event.ticket_types) {
			const q = qty[`t:${t.id}`] ?? 0;
			if (q > 0) out.push({ item_type: 'ticket', item_id: t.id, quantity: q });
		}
		for (const x of allExtras) {
			const q = qty[`x:${x.id}`] ?? 0;
			if (q > 0) out.push({ item_type: 'extra', item_id: x.id, quantity: q });
		}
		return out;
	});

	const hasTicket = $derived(lines.some((l) => l.item_type === 'ticket'));
	const hasExtraOnly = $derived(lines.length > 0 && !hasTicket);

	const total = $derived.by(() => {
		if (!event) return 0;
		let sum = 0;
		for (const tk of event.ticket_types) {
			const price = tk.active_batch?.price_cents ?? 0;
			sum += (qty[`t:${tk.id}`] ?? 0) * price;
		}
		for (const x of allExtras) sum += (qty[`x:${x.id}`] ?? 0) * x.price_cents;
		return sum;
	});

	const canEdit = $derived(
		auth.isCreator && event && (event.creator_id === auth.user?.id || auth.user?.role === 'admin')
	);

	onMount(async () => {
		try {
			event = await api.getEvent(page.params.id!);
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('event.errorFallback');
		} finally {
			loading = false;
		}
	});

	function bump(key: string, delta: number, max: number) {
		const cur = qty[key] ?? 0;
		const next = Math.max(0, Math.min(max, cur + delta));
		qty = { ...qty, [key]: next };
	}

	async function buy() {
		if (!event || lines.length === 0 || !hasTicket) return;
		if (!auth.isAuthed) {
			await goto(`/auth/login?next=/events/${event.id}`);
			return;
		}
		buyError = null;
		busy = true;
		try {
			const order = await api.createOrder(event.id, lines);
			if (order.abacate_payment_url) {
				window.location.href = order.abacate_payment_url;
			} else {
				await goto(`/orders/${order.id}`);
			}
		} catch (e) {
			buyError = e instanceof ApiError ? e.message : t('event.errorFallback');
		} finally {
			busy = false;
		}
	}
</script>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error || !event}
	<div class="error">{error ?? t('event.notFound')}</div>
{:else}
	<article class="event">
		{#if event.cover_image_url}
			<img class="cover" src={event.cover_image_url} alt="" />
		{/if}

		<div class="event-head">
			<div>
				<span class="badge {event.status}">{tStatus(event.status)}</span>
				<h1>{event.title}</h1>
				<p class="muted">{formatDate(event.starts_at)} · {event.location}</p>
			</div>
			{#if canEdit}
				<a href="/events/{event.id}/edit" class="btn secondary small">{t('common.edit')}</a>
			{/if}
		</div>

		<p class="description">{event.description}</p>

		<div class="two-col">
			<section class="stack">
				<h2>{t('event.tickets')}</h2>
				{#each event.ticket_types as tk (tk.id)}
					{@const active = tk.active_batch}
					{@const visibleBatches = tk.batches.filter(
						(b) => b.closed_at !== null || b.id === active?.id
					)}
					{@const remaining = active ? active.quantity_total - active.quantity_sold : 0}
					<div class="ticket-group">
						<div class="ticket-head">
							<strong>{tk.name}</strong>
							{#if tk.description}
								<div class="muted small">{tk.description}</div>
							{/if}
						</div>
						{#each visibleBatches as b (b.id)}
							{@const isActive = b.id === active?.id}
							<div class="line batch-line">
								<div>
									<span class="badge">{b.label}</span>
									<span class="muted small">{formatBRL(b.price_cents)}</span>
								</div>
								{#if !isActive || remaining <= 0}
									<span class="badge sold-out">{t('event.soldOut')}</span>
								{:else}
									<div class="qty">
										<button
											class="secondary small"
											onclick={() => bump(`t:${tk.id}`, -1, remaining)}>−</button
										>
										<span>{qty[`t:${tk.id}`] ?? 0}</span>
										<button
											class="secondary small"
											onclick={() => bump(`t:${tk.id}`, 1, remaining)}>+</button
										>
									</div>
								{/if}
							</div>
						{:else}
							<div class="line"><span class="badge sold-out">{t('event.soldOut')}</span></div>
						{/each}
					</div>
				{:else}
					<p class="muted">{t('event.noTickets')}</p>
				{/each}

				{#each event.extra_sections as s (s.id)}
					{#if s.extras.length}
						<h2 style="margin-top: 1rem;">{s.title}</h2>
						{#if s.description}
							<p class="muted">{s.description}</p>
						{/if}
						{#each s.extras as x (x.id)}
							{@const remaining = x.quantity_total === null
								? 999
								: x.quantity_total - x.quantity_sold}
							<div class="line">
								<div>
									<strong>{x.name}</strong>
									<div class="muted small">{x.description}</div>
									<div class="muted small">{formatBRL(x.price_cents)}</div>
								</div>
								{#if remaining <= 0}
									<span class="badge sold-out">{t('event.soldOut')}</span>
								{:else}
									<div class="qty">
										<button
											class="secondary small"
											onclick={() => bump(`x:${x.id}`, -1, remaining)}>−</button
										>
										<span>{qty[`x:${x.id}`] ?? 0}</span>
										<button
											class="secondary small"
											onclick={() => bump(`x:${x.id}`, 1, remaining)}>+</button
										>
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				{/each}
			</section>

			<aside class="summary card">
				<h3>{t('event.orderSummary')}</h3>
				{#if lines.length === 0}
					<p class="muted">{t('event.noItems')}</p>
				{:else}
					<ul class="lines">
						{#each event.ticket_types as tk (tk.id)}
							{@const q = qty[`t:${tk.id}`] ?? 0}
							{#if q > 0 && tk.active_batch}
								<li>
									<span>{tk.name} ({tk.active_batch.label}) × {q}</span>
									<span>{formatBRL(tk.active_batch.price_cents * q)}</span>
								</li>
							{/if}
						{/each}
						{#each allExtras as x (x.id)}
							{@const q = qty[`x:${x.id}`] ?? 0}
							{#if q > 0}
								<li>
									<span>{x.name} × {q}</span>
									<span>{formatBRL(x.price_cents * q)}</span>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
				<div class="total">
					<span>{t('common.total')}</span>
					<strong>{formatBRL(total)}</strong>
				</div>
				{#if hasExtraOnly}
					<p class="muted small">{t('event.ticketRequired')}</p>
				{/if}
				{#if buyError}
					<div class="error">{buyError}</div>
				{/if}
				<button disabled={lines.length === 0 || !hasTicket || busy} onclick={buy}>
					{busy ? t('event.buying') : t('event.buy')}
				</button>
			</aside>
		</div>
	</article>
{/if}

<style>
	.description {
		white-space: pre-wrap;
	}
	.cover {
		width: 100%;
		max-height: 360px;
		object-fit: cover;
		border-radius: var(--radius);
		margin: 1rem 0;
	}
	.event-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin: 1rem 0;
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		margin-top: 1.5rem;
	}
	@media (max-width: 720px) {
		.two-col {
			grid-template-columns: 1fr;
		}
	}
	.line {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.ticket-group {
		display: grid;
		gap: 0.4rem;
	}
	.ticket-head {
		padding: 0 0.25rem;
	}
	.batch-line {
		padding: 0.5rem 0.75rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.qty {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.qty span {
		min-width: 1.5rem;
		text-align: center;
	}
	.summary {
		position: sticky;
		top: 80px;
		align-self: flex-start;
	}
	.lines {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
	}
	.lines li {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
		font-size: 0.9rem;
	}
	.total {
		display: flex;
		justify-content: space-between;
		padding: 0.75rem 0;
		border-top: 1px solid var(--border);
		margin-top: 0.5rem;
		margin-bottom: 0.75rem;
	}
</style>
