<script lang="ts">
	import { fromLocalInputValue, toLocalInputValue } from '$lib/datetime';
	import { t } from '$lib/i18n';
	import type { Event } from '$lib/types';

	interface Props {
		initial?: Partial<Event>;
		submitLabel: string;
		onSubmit: (data: Partial<Event>) => Promise<void>;
	}

	let { initial = {}, submitLabel, onSubmit }: Props = $props();

	let title = $state(initial.title ?? '');
	let description = $state(initial.description ?? '');
	let tickets_description = $state(initial.tickets_description ?? '');
	let location = $state(initial.location ?? '');
	let starts_at = $state(initial.starts_at ? toLocalInputValue(initial.starts_at) : '');
	let cover_image_url = $state(initial.cover_image_url ?? '');
	let status = $state<'draft' | 'published' | 'closed'>(
		initial.status === 'published' || initial.status === 'closed' ? initial.status : 'draft'
	);
	let seat_selection_enabled = $state<boolean>(initial.seat_selection_enabled ?? false);
	let seats_per_table = $state<number | undefined>(initial.seats_per_table ?? undefined);
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			await onSubmit({
				title,
				description: description.trim(),
				tickets_description: tickets_description.trim() || null,
				location,
				starts_at: fromLocalInputValue(starts_at),
				cover_image_url: cover_image_url || null,
				status,
				seat_selection_enabled,
				seats_per_table: seat_selection_enabled ? (seats_per_table ?? null) : null
			});
		} catch (e) {
			error = e instanceof Error ? e.message : t('eventForm.saveFailed');
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} class="stack">
	<div>
		<label for="title">{t('eventForm.title')}</label>
		<input id="title" bind:value={title} required />
	</div>
	<div>
		<label for="desc">{t('eventForm.description')}</label>
		<textarea id="desc" bind:value={description} rows="4"></textarea>
	</div>
	<div>
		<label for="tickets-desc">{t('eventForm.ticketsDescription')}</label>
		<textarea id="tickets-desc" bind:value={tickets_description} rows="2"></textarea>
	</div>
	<div>
		<label for="loc">{t('eventForm.location')}</label>
		<input id="loc" bind:value={location} />
	</div>
	<div>
		<label for="starts">{t('eventForm.startsAt')}</label>
		<input id="starts" type="datetime-local" bind:value={starts_at} required />
	</div>
	<div>
		<label for="cover">{t('eventForm.coverUrl')}</label>
		<input id="cover" type="url" bind:value={cover_image_url} />
	</div>
	<div>
		<label for="status">{t('eventForm.status')}</label>
		<select id="status" bind:value={status}>
			<option value="draft">{t('eventForm.draft')}</option>
			<option value="published">{t('eventForm.published')}</option>
			<option value="closed">{t('eventForm.closed')}</option>
		</select>
	</div>
	<div class="seats">
		<label class="check">
			<input type="checkbox" bind:checked={seat_selection_enabled} />
			{t('eventForm.seatSelection')}
		</label>
		{#if seat_selection_enabled}
			<div class="seats-row">
				<label for="seats-per-table">{t('eventForm.seatsPerTable')}</label>
				<input
					id="seats-per-table"
					type="number"
					min="1"
					max="200"
					bind:value={seats_per_table}
					required
				/>
			</div>
			<p class="muted small">{t('eventForm.seatsHint')}</p>
		{/if}
	</div>
	{#if error}
		<div class="error">{error}</div>
	{/if}
	<button type="submit" disabled={busy}>
		{busy ? t('common.saving') : submitLabel}
	</button>
</form>

<style>
	.seats {
		display: grid;
		gap: 0.5rem;
	}
	.seats-row {
		display: grid;
		grid-template-columns: auto 6rem;
		align-items: center;
		gap: 0.5rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.small {
		font-size: 0.85rem;
	}
</style>
