<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, formatBRL } from '$lib/api';
	import EventForm from '$lib/components/EventForm.svelte';
	import FloatingField from '$lib/components/FloatingField.svelte';
	import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
	import { prompt as promptDialog } from '$lib/stores/prompt.svelte';
	import { t } from '$lib/i18n';
	import type { TranslationKey } from '$lib/i18n/pt';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Event, EventDetail, ExtraItem, ExtraSection, TicketType } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newTicket = $state({ name: '', price_cents: 0, quantity_total: undefined as number | undefined });

	type NewExtraForm = { name: string; price_cents: number; quantity_total: number | undefined };
	let newExtras = $state<Record<string, NewExtraForm>>({});

	function blankExtra(): NewExtraForm {
		return { name: '', price_cents: 0, quantity_total: undefined };
	}

	function ensureForms(sections: { id: string }[]) {
		for (const s of sections) {
			if (!newExtras[s.id]) newExtras[s.id] = blankExtra();
		}
	}

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
		if (event) ensureForms(event.extra_sections);
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

	async function saveTicket(tk: TicketType, patch: Partial<TicketType>) {
		actionError = null;
		try {
			await api.updateTicketType(tk.id, patch);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveTicketError');
		}
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

	async function addSection() {
		if (!event) return;
		const title = await promptDialog({
			message: t('eventEdit.newSectionPrompt'),
			placeholder: t('eventEdit.newSectionPlaceholder'),
			confirmText: t('eventEdit.create')
		});
		if (!title) return;
		actionError = null;
		try {
			await api.createExtraSection(event.id, { title });
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveSectionError');
		}
	}

	async function saveSection(s: ExtraSection, patch: Partial<ExtraSection>) {
		actionError = null;
		try {
			await api.updateExtraSection(s.id, patch);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveSectionError');
		}
	}

	async function delSection(s: ExtraSection) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteSection', { title: s.title }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteExtraSection(s.id);
			await reload();
		} catch (e) {
			if (e instanceof ApiError && e.message === 'section_not_empty') {
				actionError = t('eventEdit.sectionNotEmpty');
			} else {
				reportError(e, 'eventEdit.deleteSectionError');
			}
		}
	}

	async function saveExtra(x: ExtraItem, patch: Partial<ExtraItem>) {
		actionError = null;
		try {
			await api.updateExtra(x.id, patch);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveExtraError');
		}
	}

	async function addExtra(sectionId: string) {
		if (!event) return;
		const form = newExtras[sectionId];
		if (!form || !form.name) return;
		actionError = null;
		try {
			await api.createExtra(event.id, { ...form, section_id: sectionId });
			newExtras[sectionId] = blankExtra();
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveSectionError');
		}
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
			<div class="add">
				<FloatingField label={t('common.name')}>
					<input
						placeholder=" "
						value={tk.name}
						onchange={(e) => saveTicket(tk, { name: e.currentTarget.value })}
					/>
				</FloatingField>
				<FloatingField label={t('eventEdit.priceCents')}>
					<input
						type="text"
						inputmode="numeric"
						placeholder=" "
						value={formatCentsInput(tk.price_cents)}
						onchange={(e) =>
							saveTicket(tk, { price_cents: parseCentsInput(e.currentTarget.value) })}
					/>
				</FloatingField>
				<FloatingField label={t('eventEdit.qty')}>
					<input
						type="number"
						placeholder=" "
						value={tk.quantity_total}
						onchange={(e) => saveTicket(tk, { quantity_total: Number(e.currentTarget.value) })}
					/>
				</FloatingField>
				<button class="danger small" onclick={() => delTicket(tk)}>{t('common.delete')}</button>
			</div>
			<div class="muted small" style="padding: 0 0.75rem;">
				{tk.quantity_sold}/{tk.quantity_total} {t('eventEdit.sold')}
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

	<h2 style="margin: 1.5rem 0 0.5rem;">{t('eventEdit.addons')}</h2>

	{#each event.extra_sections as s (s.id)}
		{@const form = newExtras[s.id]}
		{#if form}
		<div class="card stack" style="margin: 1rem 0;">
			<div class="section-head">
				<FloatingField label={t('eventEdit.sectionTitle')}>
					<input
						placeholder=" "
						value={s.title}
						onchange={(e) => saveSection(s, { title: e.currentTarget.value })}
					/>
				</FloatingField>
				<button class="danger small" onclick={() => delSection(s)}>
					{t('eventEdit.deleteSection')}
				</button>
			</div>
			<FloatingField label={t('eventEdit.sectionDescription')}>
				<textarea
					placeholder=" "
					rows="2"
					value={s.description ?? ''}
					onchange={(e) => saveSection(s, { description: e.currentTarget.value })}
				></textarea>
			</FloatingField>

			{#each s.extras as x (x.id)}
				<div class="add">
					<FloatingField label={t('common.name')}>
						<input
							placeholder=" "
							value={x.name}
							onchange={(e) => saveExtra(x, { name: e.currentTarget.value })}
						/>
					</FloatingField>
					<FloatingField label={t('eventEdit.priceCents')}>
						<input
							type="text"
							inputmode="numeric"
							placeholder=" "
							value={formatCentsInput(x.price_cents)}
							onchange={(e) =>
								saveExtra(x, { price_cents: parseCentsInput(e.currentTarget.value) })}
						/>
					</FloatingField>
					<FloatingField label={t('eventEdit.qtyUnlimited')}>
						<input
							type="number"
							placeholder=" "
							value={x.quantity_total ?? ''}
							onchange={(e) => {
								const v = e.currentTarget.value;
								saveExtra(x, { quantity_total: v === '' ? null : Number(v) });
							}}
						/>
					</FloatingField>
					<button class="danger small" onclick={() => delExtra(x)}>{t('common.delete')}</button>
				</div>
			{/each}
			<div class="add">
				<FloatingField label={t('common.name')}>
					<input placeholder=" " bind:value={form.name} />
				</FloatingField>
				<FloatingField label={t('eventEdit.priceCents')}>
					<input
						type="text"
						inputmode="numeric"
						placeholder=" "
						value={formatCentsInput(form.price_cents)}
						oninput={(e) => (form.price_cents = parseCentsInput(e.currentTarget.value))}
					/>
				</FloatingField>
				<FloatingField label={t('eventEdit.qtyUnlimited')}>
					<input type="number" placeholder=" " bind:value={form.quantity_total} />
				</FloatingField>
				<button class="small" onclick={() => addExtra(s.id)}>{t('eventEdit.add')}</button>
			</div>
		</div>
		{/if}
	{/each}

	<button class="secondary" onclick={addSection}>{t('eventEdit.addSection')}</button>

	{#if actionError}
		<div class="error" style="margin: 1rem 0;">{actionError}</div>
	{/if}

	<button class="danger" style="margin-top: 1.5rem;" onclick={deleteEvent}>
		{t('eventEdit.deleteEvent')}
	</button>
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
	.section-head {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.section-head :global(label.float) {
		flex: 1;
	}
	@media (max-width: 600px) {
		.add {
			grid-template-columns: 1fr;
		}
	}
</style>
