<script lang="ts">
	import { api, ApiError, formatBRL } from '$lib/api';
	import { formatCentsInput, parseCentsInput } from '$lib/utils/currency';
	import { formatDateTime } from '$lib/utils/datetime';
	import { t } from '$lib/i18n';
	import type { TranslationKey } from '$lib/i18n/pt';
	import type { EventStats, Payout, PayoutStatus, PixKeyType } from '$lib/types';

	type Props = {
		eventId: string;
		stats: EventStats;
		open: boolean;
		onClose: () => void;
		onChange: () => Promise<void> | void;
	};

	let { eventId, stats, open, onClose, onChange }: Props = $props();

	const MAX_WITHDRAW_CENTS = 500_000;
	const RATE_LIMIT_HOURS = 24;
	const PIX_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'evp'];

	let editingPix = $state(false);
	let pixKeyDraft = $state('');
	let pixKeyTypeDraft = $state<PixKeyType>('email');
	let pixSaving = $state(false);
	let pixError = $state<string | null>(null);

	let amountCents = $state(0);
	let withdrawSubmitting = $state(false);
	let withdrawError = $state<string | null>(null);
	let withdrawSuccess = $state(false);

	let payouts = $state<Payout[] | null>(null);
	let payoutsLoading = $state(false);

	let lastSeenOpen = false;

	$effect(() => {
		if (open && !lastSeenOpen) {
			lastSeenOpen = true;
			resetForOpen();
			loadPayoutHistory();
		} else if (!open && lastSeenOpen) {
			lastSeenOpen = false;
		}
	});

	function resetForOpen() {
		editingPix = !stats.organization.pix_key;
		pixKeyDraft = stats.organization.pix_key ?? '';
		pixKeyTypeDraft = stats.organization.pix_key_type ?? 'email';
		pixError = null;
		amountCents = 0;
		withdrawError = null;
		withdrawSuccess = false;
	}

	function hoursSince(iso: string | null): number | null {
		if (!iso) return null;
		const ms = Date.now() - new Date(iso).getTime();
		return ms / 3_600_000;
	}

	function rateLimited(): boolean {
		const h = hoursSince(stats.totals.last_payout_at);
		return h !== null && h < RATE_LIMIT_HOURS;
	}

	function hoursRemaining(): number {
		const h = hoursSince(stats.totals.last_payout_at);
		return h === null ? 0 : Math.max(0, Math.ceil(RATE_LIMIT_HOURS - h));
	}

	async function loadPayoutHistory() {
		payoutsLoading = true;
		try {
			payouts = await api.listPayouts(eventId);
		} catch {
			payouts = [];
		} finally {
			payoutsLoading = false;
		}
	}

	async function savePixKey() {
		pixSaving = true;
		pixError = null;
		try {
			await api.updatePayoutSettings(stats.organization.id, {
				pix_key: pixKeyDraft.trim(),
				pix_key_type: pixKeyTypeDraft,
			});
			await onChange();
			editingPix = false;
		} catch (e) {
			pixError = e instanceof ApiError ? e.message : t('dashboard.errorFallback');
		} finally {
			pixSaving = false;
		}
	}

	function withdrawErrorKey(code: string): TranslationKey {
		switch (code) {
			case 'pix_key_missing':
				return 'withdraw.errors.pixKeyMissing';
			case 'insufficient_balance':
				return 'withdraw.errors.insufficientBalance';
			case 'rate_limited':
				return 'withdraw.errors.rateLimited';
			case 'invalid_amount':
				return 'withdraw.errors.invalidAmount';
			default:
				return 'withdraw.errors.upstream';
		}
	}

	async function submitWithdraw() {
		if (!canSubmitWithdraw()) return;
		withdrawSubmitting = true;
		withdrawError = null;
		try {
			await api.createPayout(eventId, { amount_cents: amountCents });
			withdrawSuccess = true;
			amountCents = 0;
			await onChange();
			await loadPayoutHistory();
		} catch (e) {
			withdrawError =
				e instanceof ApiError ? t(withdrawErrorKey(e.message)) : t('dashboard.errorFallback');
		} finally {
			withdrawSubmitting = false;
		}
	}

	function canSubmitWithdraw(): boolean {
		if (!stats.organization.pix_key) return false;
		if (rateLimited()) return false;
		if (amountCents <= 0) return false;
		if (amountCents > MAX_WITHDRAW_CENTS) return false;
		if (amountCents > stats.totals.available_to_withdraw_cents) return false;
		return true;
	}

	function payoutStatusKey(s: PayoutStatus): TranslationKey {
		return `withdraw.status.${s}` as TranslationKey;
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="withdraw-title">
			<div class="dialog-head">
				<h3 id="withdraw-title">{t('withdraw.title')}</h3>
				<button type="button" class="secondary small" onclick={onClose}>
					{t('dashboard.close')}
				</button>
			</div>

			<section class="withdraw-section">
				<div class="muted small">{t('withdraw.pixKey')}</div>
				{#if editingPix}
					<div class="pix-form">
						<select bind:value={pixKeyTypeDraft} disabled={pixSaving}>
							{#each PIX_TYPES as kt}
								<option value={kt}>{t(`withdraw.pixKeyTypes.${kt}` as TranslationKey)}</option>
							{/each}
						</select>
						<input
							type="text"
							bind:value={pixKeyDraft}
							placeholder={t('withdraw.pixKey')}
							disabled={pixSaving}
						/>
						<button
							type="button"
							class="btn small"
							onclick={savePixKey}
							disabled={pixSaving || pixKeyDraft.trim().length === 0}
						>
							{t('withdraw.saveKey')}
						</button>
						{#if stats.organization.pix_key}
							<button
								type="button"
								class="btn secondary small"
								onclick={() => (editingPix = false)}
								disabled={pixSaving}
							>
								{t('withdraw.cancel')}
							</button>
						{/if}
					</div>
					{#if pixError}<div class="error">{pixError}</div>{/if}
				{:else if stats.organization.pix_key}
					<div class="row-between">
						<div>
							<strong>{stats.organization.pix_key}</strong>
							<div class="muted small">
								{t(`withdraw.pixKeyTypes.${stats.organization.pix_key_type}` as TranslationKey)}
							</div>
						</div>
						<button type="button" class="btn secondary small" onclick={() => (editingPix = true)}>
							{t('withdraw.editKey')}
						</button>
					</div>
				{:else}
					<p class="muted">{t('withdraw.pixKeyNone')}</p>
				{/if}
			</section>

			<section class="withdraw-section">
				<div class="muted small">
					{t('withdraw.available', {
						amount: formatBRL(stats.totals.available_to_withdraw_cents),
					})}
				</div>
				<div class="muted small">{t('withdraw.max')}</div>
				<label class="amount-field">
					<span>{t('withdraw.amount')}</span>
					<input
						type="text"
						inputmode="numeric"
						placeholder="0,00"
						value={formatCentsInput(amountCents)}
						oninput={(e) => (amountCents = parseCentsInput(e.currentTarget.value))}
						disabled={!stats.organization.pix_key || withdrawSubmitting || rateLimited()}
					/>
				</label>
				{#if rateLimited()}
					<div class="muted small">
						{t('withdraw.errors.rateLimited')} ({hoursRemaining()}h)
					</div>
				{/if}
				{#if withdrawError}<div class="error">{withdrawError}</div>{/if}
				{#if withdrawSuccess}<div class="success">{t('withdraw.success')}</div>{/if}
				<button
					type="button"
					class="btn"
					onclick={submitWithdraw}
					disabled={withdrawSubmitting || !canSubmitWithdraw()}
				>
					{withdrawSubmitting ? t('withdraw.submitting') : t('withdraw.submit')}
				</button>
			</section>

			<section class="withdraw-section">
				<div class="muted small">{t('withdraw.history')}</div>
				{#if payoutsLoading}
					<p class="muted">{t('common.loading')}</p>
				{:else if !payouts || payouts.length === 0}
					<p class="muted">{t('withdraw.noHistory')}</p>
				{:else}
					<ul class="payouts">
						{#each payouts as p (p.id)}
							<li>
								<span>{formatDateTime(p.created_at)}</span>
								<span>{formatBRL(p.amount_cents)}</span>
								<span class="badge {p.status}">{t(payoutStatusKey(p.status))}</span>
								{#if p.receipt_url}
									<a href={p.receipt_url} target="_blank" rel="noopener">
										{t('withdraw.receipt')}
									</a>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
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
		max-height: 80vh;
		overflow: auto;
		display: flex;
		flex-direction: column;
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
	.row-between {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.withdraw-section {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.pix-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.pix-form input,
	.pix-form select {
		flex: 1 1 auto;
		min-width: 0;
	}
	.amount-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.amount-field input {
		font-size: 1.25rem;
		padding: 0.4rem 0.6rem;
	}
	.success {
		color: var(--accent);
		font-size: 0.9rem;
	}
	.payouts {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}
	.payouts li {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.4rem 0.6rem;
		background: var(--surface-2);
		border-radius: var(--radius);
		font-size: 0.9rem;
	}
</style>
