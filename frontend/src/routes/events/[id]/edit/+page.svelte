<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import EventForm from '$lib/components/EventForm.svelte';
	import FloatingField from '$lib/components/FloatingField.svelte';
	import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
	import { t } from '$lib/i18n';
	import type { TranslationKey } from '$lib/i18n/pt';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Event, EventDetail, ExtraItem, TicketType } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newTicket = $state({ name: '', price_cents: 0, quantity_total: undefined as number | undefined });
	let newExtra = $state({ name: '', price_cents: 0, quantity_total: undefined as number | undefined });

	function formatCentsInput(cents: number): string {
		const c = Math.max(0, Math.trunc(cents));
		if (c === 0) return '';
		return (c / 100).toFixed(2);
	}

	function parseCentsInput(value: string): number {
		const digits = value.replace(/\D/g, '');
		if (!digits) return 0;
		return Number(digits);
	}
	let actionError = $state<string | null>(null);

	function reportError(e: unknown, fallbackKey: TranslationKey) {
		actionError = e instanceof ApiError ? e.message : t(fallbackKey);
	}

	async function reload() {
		event = await api.getEvent(page.params.id!);
	}

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		try {
			await reload();
			if (event && event.creator_id !== auth.user?.id && auth.user?.role !== 'admin') {
				await goto(`/events/${event.id}`);
				return;
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('eventEdit.errorFallback');
		} finally {
			loading = false;
		}
	});

	async function saveEvent(data: Partial<Event>) {
		if (!event) return;
		await api.updateEvent(event.id, data);
		await reload();
	}

	async function addTicket() {
		if (!event || !newTicket.name) return;
		await api.createTicketType(event.id, newTicket);
		newTicket = { name: '', price_cents: 0, quantity_total: undefined as number | undefined };
		await reload();
	}

	async function delTicket(tk: TicketType) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteTicket', { name: tk.name }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteTicketType(tk.id);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.deleteTicketError');
		}
	}

	async function addExtra() {
		if (!event || !newExtra.name) return;
		await api.createExtra(event.id, newExtra);
		newExtra = { name: '', price_cents: 0, quantity_total: undefined as number | undefined };
		await reload();
	}

	async function delExtra(x: ExtraItem) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteExtra', { name: x.name }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteExtra(x.id);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.deleteExtraError');
		}
	}

	async function deleteEvent() {
		if (!event) return;
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteEvent', { title: event.title }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteEvent(event.id);
			await goto('/');
		} catch (e) {
			reportError(e, 'eventEdit.deleteEventError');
		}
	}
</script>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error || !event}
	<div class="error">{error ?? t('eventEdit.notFound')}</div>
{:else}
	<h1>{t('eventEdit.title')}</h1>
	<div class="card" style="margin: 1rem 0;">
		<EventForm initial={event} submitLabel={t('eventEdit.saveEvent')} onSubmit={saveEvent} />
	</div>

	<div class="card stack" style="margin: 1rem 0;">
		<h2>{t('eventEdit.ticketTypes')}</h2>
		{#each event.ticket_types as tk (tk.id)}
			<div class="row-line">
				<div>
					<strong>{tk.name}</strong>
					<span class="muted small">
						— {formatBRL(tk.price_cents)} · {tk.quantity_sold}/{tk.quantity_total}
						{t('eventEdit.sold')}</span
					>
				</div>
				<button class="danger small" onclick={() => delTicket(tk)}>{t('common.delete')}</button>
			</div>
		{/each}
		<div class="add">
			<FloatingField label={t('common.name')}>
				<input placeholder=" " bind:value={newTicket.name} />
			</FloatingField>
			<FloatingField label={t('eventEdit.priceCents')}>
				<input
					type="text"
					inputmode="numeric"
					placeholder=" "
					value={formatCentsInput(newTicket.price_cents)}
					oninput={(e) => (newTicket.price_cents = parseCentsInput(e.currentTarget.value))}
				/>
			</FloatingField>
			<FloatingField label={t('eventEdit.qty')}>
				<input type="number" placeholder=" " bind:value={newTicket.quantity_total} />
			</FloatingField>
			<button class="small" onclick={addTicket}>{t('eventEdit.add')}</button>
		</div>
	</div>

	<div class="card stack" style="margin: 1rem 0;">
		<h2>{t('eventEdit.addons')}</h2>
		{#each event.extras as x (x.id)}
			<div class="row-line">
				<div>
					<strong>{x.name}</strong>
					<span class="muted small"> — {formatBRL(x.price_cents)}</span>
				</div>
				<button class="danger small" onclick={() => delExtra(x)}>{t('common.delete')}</button>
			</div>
		{/each}
		<div class="add">
			<FloatingField label={t('common.name')}>
				<input placeholder=" " bind:value={newExtra.name} />
			</FloatingField>
			<FloatingField label={t('eventEdit.priceCents')}>
				<input
					type="text"
					inputmode="numeric"
					placeholder=" "
					value={formatCentsInput(newExtra.price_cents)}
					oninput={(e) => (newExtra.price_cents = parseCentsInput(e.currentTarget.value))}
				/>
			</FloatingField>
			<FloatingField label={t('eventEdit.qtyUnlimited')}>
				<input type="number" placeholder=" " bind:value={newExtra.quantity_total} />
			</FloatingField>
			<button class="small" onclick={addExtra}>{t('eventEdit.add')}</button>
		</div>
	</div>

	{#if actionError}
		<div class="error" style="margin: 1rem 0;">{actionError}</div>
	{/if}

	<button class="danger" onclick={deleteEvent}>{t('eventEdit.deleteEvent')}</button>
{/if}

<style>
	.row-line {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: var(--surface-2);
		border-radius: var(--radius);
	}
	.small {
		font-size: 0.85rem;
	}
	.add {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr auto;
		gap: 0.5rem;
		align-items: center;
	}
	@media (max-width: 600px) {
		.add {
			grid-template-columns: 1fr;
		}
	}
</style>
