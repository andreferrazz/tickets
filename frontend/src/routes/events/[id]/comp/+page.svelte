<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { CompRecipient, CompTicketsResult, EventDetail, TicketType } from '$lib/types';
	import { onMount } from 'svelte';

	interface Row {
		email: string;
		quantity: number;
	}

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let selectedTypeId = $state('');
	let rows = $state<Row[]>([{ email: '', quantity: 1 }]);
	let sending = $state(false);
	let formError = $state<string | null>(null);
	let result = $state<CompTicketsResult | null>(null);

	// Only ticket types with an open batch can be issued — the backend resolves
	// the active batch and would otherwise reject them as out of stock.
	const availableTypes = $derived(
		(event?.ticket_types ?? []).filter((tt: TicketType) => tt.active_batch)
	);

	// Rows with a non-empty email, normalized into the API payload shape.
	const recipients = $derived<CompRecipient[]>(
		rows
			.map((r) => ({ email: r.email.trim().toLowerCase(), quantity: Math.max(1, r.quantity) }))
			.filter((r) => r.email !== '')
	);

	// Maps the backend's short reason string to a localized label, falling back
	// to a generic message for anything unmapped.
	function reasonLabel(reason: string): string {
		if (reason.startsWith('invalid_email')) return t('comp.error.invalid_email');
		if (reason.startsWith('invalid_quantity')) return t('comp.error.invalid_quantity');
		if (reason.startsWith('out_of_stock')) return t('comp.error.out_of_stock');
		if (reason.startsWith('event_not_available')) return t('comp.error.event_not_available');
		if (reason.startsWith('not_found')) return t('comp.error.not_found');
		return t('comp.error.generic');
	}

	function addRow() {
		rows = [...rows, { email: '', quantity: 1 }];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, i) => i !== index);
		if (rows.length === 0) rows = [{ email: '', quantity: 1 }];
	}

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto(`/auth/login?next=/events/${page.params.id}/comp`);
			return;
		}
		try {
			event = await api.getEvent(page.params.id!);
			const first = (event.ticket_types ?? []).find((tt) => tt.active_batch);
			if (first) selectedTypeId = first.id;
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				error = t('comp.notAuthorized');
			} else {
				error = e instanceof ApiError ? e.message : t('comp.errorFallback');
			}
		} finally {
			loading = false;
		}
	});

	async function send() {
		if (sending) return;
		formError = null;
		if (!selectedTypeId) {
			formError = t('comp.needTicketType');
			return;
		}
		if (recipients.length === 0) {
			formError = t('comp.needRecipients');
			return;
		}
		sending = true;
		result = null;
		try {
			result = await api.sendCompTickets(page.params.id!, selectedTypeId, recipients);
			// On a fully successful send, reset the form to a single empty row.
			if (result.failed.length === 0) rows = [{ email: '', quantity: 1 }];
		} catch (e) {
			formError = e instanceof ApiError ? e.message : t('comp.errorFallback');
		} finally {
			sending = false;
		}
	}
</script>

<header class="head">
	<h1>{t('comp.title')}</h1>
	<a href="/events/{page.params.id}/dashboard" class="btn secondary small">←</a>
</header>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else}
	<p class="muted subtitle">{t('comp.subtitle')}</p>

	{#if availableTypes.length === 0}
		<p class="muted">{t('comp.noTicketTypes')}</p>
	{:else}
		<div class="card form">
			<label class="field">
				<span>{t('comp.ticketType')}</span>
				<select bind:value={selectedTypeId}>
					{#each availableTypes as tt (tt.id)}
						<option value={tt.id}>{tt.name}</option>
					{/each}
				</select>
			</label>

			<div class="field">
				<span>{t('comp.recipients')}</span>
				<div class="rows">
					{#each rows as row, i (i)}
						<div class="row">
							<input
								type="email"
								class="email"
								placeholder={t('comp.emailPlaceholder')}
								bind:value={row.email}
							/>
							<input
								type="number"
								class="qty"
								min="1"
								step="1"
								aria-label={t('comp.qty')}
								bind:value={row.quantity}
							/>
							<button
								type="button"
								class="btn secondary small remove"
								aria-label={t('comp.removeRecipient')}
								title={t('comp.removeRecipient')}
								onclick={() => removeRow(i)}
							>
								×
							</button>
						</div>
					{/each}
				</div>
				<button type="button" class="btn secondary small add" onclick={addRow}>
					{t('comp.addRecipient')}
				</button>
			</div>

			{#if formError}
				<div class="error">{formError}</div>
			{/if}

			<button class="btn" onclick={send} disabled={sending || recipients.length === 0}>
				{sending ? t('comp.sending') : t('comp.send')}
			</button>
		</div>
	{/if}

	{#if result}
		<div class="card result">
			{#if result.sent.length > 0}
				<h3>{t('comp.sentTitle', { count: result.sent.length })}</h3>
				<ul class="sent">
					{#each result.sent as email (email)}
						<li>{email}</li>
					{/each}
				</ul>
			{/if}
			{#if result.failed.length > 0}
				<h3>{t('comp.failedTitle', { count: result.failed.length })}</h3>
				<ul class="failed">
					{#each result.failed as row, i (i)}
						<li><span class="email">{row.email ?? '—'}</span> — {reasonLabel(row.error)}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1rem 0 1rem;
	}
	.subtitle {
		margin: 0 0 1.25rem;
		max-width: 46rem;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 32rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field > span {
		font-size: 0.9rem;
		color: var(--muted);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.row .email {
		flex: 1;
	}
	.row .qty {
		width: 5rem;
		text-align: right;
	}
	.row .remove {
		flex: none;
		line-height: 1;
	}
	.add {
		align-self: flex-start;
	}
	.form > .btn {
		align-self: flex-start;
	}
	.result {
		margin-top: 1.25rem;
		max-width: 32rem;
	}
	.result h3 {
		margin: 0.75rem 0 0.35rem;
		font-size: 1rem;
	}
	.result ul {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.2rem;
	}
	.result .failed .email {
		font-weight: 600;
	}
</style>
