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
	import type {
		Batch,
		Event,
		EventDetail,
		ExtraItem,
		ExtraSection,
		SeatTable,
		SeatingTableSnapshot,
		TicketType
	} from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newTicket = $state({ name: '' });

	type NewBatchForm = { price_cents: number; quantity_total: number | undefined };
	let newBatches = $state<Record<string, NewBatchForm>>({});

	function blankBatch(): NewBatchForm {
		return { price_cents: 0, quantity_total: undefined };
	}

	function ensureBatchForms(ticketTypes: { id: string }[]) {
		for (const tk of ticketTypes) {
			if (!newBatches[tk.id]) newBatches[tk.id] = blankBatch();
		}
	}

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
		if (event) {
			ensureForms(event.extra_sections);
			ensureBatchForms(event.ticket_types);
		}
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
		try {
			await api.updateEvent(event.id, data);
			await reload();
		} catch (e) {
			if (e instanceof ApiError && e.message === 'seat_selection_in_use') {
				actionError = t('eventEdit.seatsInUse');
				throw new Error(t('eventEdit.seatsInUse'));
			}
			if (e instanceof ApiError && e.message === 'seats_per_table_too_low') {
				actionError = t('eventEdit.seatsTooLow');
				throw new Error(t('eventEdit.seatsTooLow'));
			}
			throw e;
		}
	}

	let newTableName = $state('');

	async function addTable() {
		if (!event || !newTableName.trim()) return;
		actionError = null;
		try {
			await api.createSeatTable(event.id, { name: newTableName.trim() });
			newTableName = '';
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveTableError');
		}
	}

	async function renameTable(table: SeatTable | SeatingTableSnapshot, name: string) {
		actionError = null;
		try {
			await api.updateSeatTable(table.id, { name });
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveTableError');
		}
	}

	async function delTable(table: SeatingTableSnapshot) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteTable', { name: table.name }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteSeatTable(table.id);
			await reload();
		} catch (e) {
			if (e instanceof ApiError && e.message === 'table_has_assignments') {
				actionError = t('eventEdit.tableHasAssignments');
			} else {
				reportError(e, 'eventEdit.deleteTableError');
			}
		}
	}

	async function addTicket() {
		if (!event || !newTicket.name) return;
		await api.createTicketType(event.id, newTicket);
		newTicket = { name: '' };
		await reload();
	}

	async function addBatch(tk: TicketType) {
		const form = newBatches[tk.id];
		if (!form || !form.quantity_total || form.quantity_total <= 0) return;
		actionError = null;
		try {
			await api.createBatch(tk.id, {
				price_cents: form.price_cents,
				quantity_total: form.quantity_total
			});
			newBatches[tk.id] = blankBatch();
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveBatchError');
		}
	}

	async function saveBatch(b: Batch, patch: Partial<Batch>) {
		actionError = null;
		try {
			await api.updateBatch(b.id, patch);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.saveBatchError');
		}
	}

	async function closeBatch(b: Batch) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmCloseBatch', { label: b.label }),
			confirmText: t('eventEdit.closeBatch'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.closeBatch(b.id);
			await reload();
		} catch (e) {
			reportError(e, 'eventEdit.closeBatchError');
		}
	}

	async function delBatch(b: Batch) {
		const ok = await confirmDialog({
			message: t('eventEdit.confirmDeleteBatch', { label: b.label }),
			confirmText: t('common.delete'),
			danger: true
		});
		if (!ok) return;
		actionError = null;
		try {
			await api.deleteBatch(b.id);
			await reload();
		} catch (e) {
			if (e instanceof ApiError && e.message === 'batch_has_sales') {
				actionError = t('eventEdit.batchHasSales');
			} else {
				reportError(e, 'eventEdit.deleteBatchError');
			}
		}
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

	// Drag-and-drop reorder state. `armedHandleId` lets HTML5 DnD start only when
	// the user presses the grip on a section card (inputs/buttons stay clickable).
	let armedHandleId = $state<string | null>(null);
	let draggingSectionId = $state<string | null>(null);
	let dragOverSectionId = $state<string | null>(null);

	function onSectionDragStart(e: DragEvent, sectionId: string) {
		if (armedHandleId !== sectionId) {
			e.preventDefault();
			return;
		}
		draggingSectionId = sectionId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', sectionId);
		}
	}

	function onSectionDragOver(e: DragEvent, sectionId: string) {
		if (!draggingSectionId || draggingSectionId === sectionId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverSectionId = sectionId;
	}

	function onSectionDragLeave(sectionId: string) {
		if (dragOverSectionId === sectionId) dragOverSectionId = null;
	}

	function onSectionDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		const fromId = draggingSectionId;
		draggingSectionId = null;
		dragOverSectionId = null;
		armedHandleId = null;
		if (fromId && fromId !== targetId) reorderSections(fromId, targetId);
	}

	function onSectionDragEnd() {
		draggingSectionId = null;
		dragOverSectionId = null;
		armedHandleId = null;
	}

	async function reorderSections(fromId: string, targetId: string) {
		if (!event) return;
		const sections = [...event.extra_sections];
		const fromIdx = sections.findIndex((s) => s.id === fromId);
		const toIdx = sections.findIndex((s) => s.id === targetId);
		if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
		const [moved] = sections.splice(fromIdx, 1);
		sections.splice(toIdx, 0, moved);
		event.extra_sections = sections;
		actionError = null;
		try {
			const writes = sections.flatMap((s, i) =>
				s.position === i ? [] : [api.updateExtraSection(s.id, { position: i })]
			);
			await Promise.all(writes);
			await reload();
		} catch (e) {
			await reload();
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
			{@const batchForm = newBatches[tk.id]}
			<div class="ticket-type">
				<div class="add">
					<FloatingField label={t('common.name')}>
						<input
							placeholder=" "
							value={tk.name}
							onchange={(e) => saveTicket(tk, { name: e.currentTarget.value })}
						/>
					</FloatingField>
					<button class="danger small" onclick={() => delTicket(tk)}>
						{t('common.delete')}
					</button>
				</div>

				<h3 class="batches-head">{t('eventEdit.batches')}</h3>
				{#each tk.batches as b (b.id)}
					{@const isActive = tk.active_batch?.id === b.id}
					{@const status = b.closed_at
						? t('eventEdit.batchClosed')
						: isActive
							? t('eventEdit.batchActive')
							: t('eventEdit.batchUpcoming')}
					<div class="add batch-row">
						<div class="batch-label">
							<strong>{b.label}</strong>
							<span class="muted small">{status}</span>
						</div>
						<FloatingField label={t('eventEdit.priceCents')}>
							<input
								type="text"
								inputmode="numeric"
								placeholder=" "
								disabled={!!b.closed_at}
								value={formatCentsInput(b.price_cents)}
								onchange={(e) =>
									saveBatch(b, { price_cents: parseCentsInput(e.currentTarget.value) })}
							/>
						</FloatingField>
						<FloatingField label={t('eventEdit.qty')}>
							<input
								type="number"
								placeholder=" "
								disabled={!!b.closed_at}
								value={b.quantity_total}
								onchange={(e) =>
									saveBatch(b, { quantity_total: Number(e.currentTarget.value) })}
							/>
						</FloatingField>
						<div class="muted small">
							{b.quantity_sold}/{b.quantity_total} {t('eventEdit.sold')}
						</div>
						{#if isActive}
							<button class="secondary small" onclick={() => closeBatch(b)}>
								{t('eventEdit.closeBatch')}
							</button>
						{:else if b.quantity_sold === 0}
							<button class="danger small" onclick={() => delBatch(b)}>
								{t('common.delete')}
							</button>
						{/if}
					</div>
				{/each}
				{#if batchForm}
					<div class="add batch-row">
						<div class="batch-label">
							<strong>Lote {tk.batches.length + 1}</strong>
						</div>
						<FloatingField label={t('eventEdit.priceCents')}>
							<input
								type="text"
								inputmode="numeric"
								placeholder=" "
								value={formatCentsInput(batchForm.price_cents)}
								oninput={(e) => (batchForm.price_cents = parseCentsInput(e.currentTarget.value))}
							/>
						</FloatingField>
						<FloatingField label={t('eventEdit.qty')}>
							<input type="number" placeholder=" " bind:value={batchForm.quantity_total} />
						</FloatingField>
						<div></div>
						<button class="small" onclick={() => addBatch(tk)}>{t('eventEdit.addBatch')}</button>
					</div>
				{/if}
			</div>
		{/each}
		<div class="add">
			<FloatingField label={t('common.name')}>
				<input placeholder=" " bind:value={newTicket.name} />
			</FloatingField>
			<button class="small" onclick={addTicket}>{t('eventEdit.add')}</button>
		</div>
	</div>

	<div class="card stack" style="margin: 1rem 0;">
		<h2>{t('eventEdit.seating')}</h2>
		{#if !event.seat_selection_enabled}
			<p class="muted">{t('eventEdit.seatingDisabledHint')}</p>
		{:else}
			{#each event.seating?.tables ?? [] as tbl (tbl.id)}
				<div class="add table-row">
					<FloatingField label={t('eventEdit.tableName')}>
						<input
							placeholder=" "
							value={tbl.name}
							onchange={(e) => renameTable(tbl, e.currentTarget.value)}
						/>
					</FloatingField>
					<div class="muted small">
						{t('eventEdit.seatsTaken', {
							taken: tbl.taken_seats.length,
							total: event.seats_per_table ?? 0
						})}
					</div>
					<button class="danger small" onclick={() => delTable(tbl)}>
						{t('common.delete')}
					</button>
				</div>
			{/each}
			<div class="add table-row">
				<FloatingField label={t('eventEdit.tableName')}>
					<input
						placeholder={t('eventEdit.tableNamePlaceholder')}
						bind:value={newTableName}
					/>
				</FloatingField>
				<div></div>
				<button class="small" onclick={addTable}>{t('eventEdit.addTable')}</button>
			</div>
		{/if}
	</div>

	<h2 style="margin: 1.5rem 0 0.5rem;">{t('eventEdit.addons')}</h2>

	{#each event.extra_sections as s (s.id)}
		{@const form = newExtras[s.id]}
		{#if form}
		<div
			class="card stack section-card"
			class:dragging={draggingSectionId === s.id}
			class:drag-over={dragOverSectionId === s.id && draggingSectionId !== s.id}
			style="margin: 1rem 0;"
			role="group"
			draggable={armedHandleId === s.id}
			ondragstart={(e) => onSectionDragStart(e, s.id)}
			ondragover={(e) => onSectionDragOver(e, s.id)}
			ondragleave={() => onSectionDragLeave(s.id)}
			ondrop={(e) => onSectionDrop(e, s.id)}
			ondragend={onSectionDragEnd}
		>
			<div class="section-head">
				<button
					type="button"
					class="drag-handle"
					aria-label={t('eventEdit.reorderSection')}
					title={t('eventEdit.reorderSection')}
					onpointerdown={() => (armedHandleId = s.id)}
					onpointerup={() => (armedHandleId = null)}
					onpointerleave={() => {
						if (!draggingSectionId) armedHandleId = null;
					}}
				>⠿</button>
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
					<label class="check">
						<input
							type="checkbox"
							checked={x.show_remaining}
							onchange={(e) =>
								saveExtra(x, { show_remaining: e.currentTarget.checked })}
						/>
						{t('eventEdit.showRemaining')}
					</label>
					<label class="check">
						<input
							type="checkbox"
							checked={x.limit_to_ticket_count}
							onchange={(e) =>
								saveExtra(x, { limit_to_ticket_count: e.currentTarget.checked })}
						/>
						{t('eventEdit.limitToTicketCount')}
					</label>
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
	.ticket-type {
		padding: 0.75rem;
		background: var(--surface-2);
		border-radius: var(--radius);
		display: grid;
		gap: 0.5rem;
	}
	.ticket-type > .add:first-child {
		grid-template-columns: 1fr auto;
	}
	.batches-head {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.batch-row {
		grid-template-columns: auto 1fr 1fr auto auto;
	}
	.table-row {
		grid-template-columns: 1fr auto auto;
	}
	.batch-label {
		display: flex;
		flex-direction: column;
		min-width: 5rem;
	}
	.section-head {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.section-head :global(label.float) {
		flex: 1;
	}
	.section-card {
		transition: outline-color 120ms ease;
	}
	.section-card.dragging {
		opacity: 0.55;
	}
	.section-card.drag-over {
		outline: 2px dashed var(--accent, #4a8cff);
		outline-offset: 2px;
	}
	.drag-handle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--text-muted, #888);
		font-size: 1.1rem;
		line-height: 1;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.drag-handle:active {
		cursor: grabbing;
	}
	@media (max-width: 600px) {
		.add {
			grid-template-columns: 1fr;
		}
	}
</style>
