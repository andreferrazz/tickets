<script lang="ts">
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import { formatBRL } from '$lib/api';
    import { t } from '$lib/i18n';
    import type { TranslationKey } from '$lib/i18n/pt';
    import type { EventStatsDto } from '$lib/modules/events/stats-types';
    import type { PayoutDto } from '$lib/modules/payouts/types';
    import type { PayoutStatus, PixKeyType } from '$lib/types';
    import { formatCentsInput, parseCentsInput } from '$lib/utils/currency';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { SubmitFunction } from '@sveltejs/kit';

    // Presentational: the dashboard load supplies the figures and the payout
    // history, and its `savePayoutKey` and `withdraw` actions do the work. The
    // dashboard mounts this only while the dialog is open, so every opening
    // starts from a clean form.
    type Props = {
        stats: EventStatsDto;
        payouts: PayoutDto[];
        onClose: () => void;
    };

    let { stats, payouts, onClose }: Props = $props();

    const MAX_WITHDRAW_CENTS = 500_000;
    const RATE_LIMIT_HOURS = 24;
    const PIX_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'evp'];
    const WITHDRAW_ERRORS: Record<string, TranslationKey> = {
        pix_key_missing: 'withdraw.errors.pixKeyMissing',
        insufficient_balance: 'withdraw.errors.insufficientBalance',
        rate_limited: 'withdraw.errors.rateLimited',
        invalid_amount: 'withdraw.errors.invalidAmount'
    };

    // The form posts keep the dialog's own query parameter, so a reload or a
    // browser without scripts lands back on the open dialog with the answer.
    const savePayoutKeyAction = '?/savePayoutKey&withdraw=1';
    const withdrawAction = '?/withdraw&withdraw=1';

    let editRequested = $state(false);
    let pixSaving = $state(false);
    let amountCents = $state(0);
    let withdrawSubmitting = $state(false);

    const pixKey = $derived(stats.organization.pixKey);
    // Without a key there is nothing to show but the form that sets one.
    const editingPix = $derived(editRequested || !pixKey);

    // What the last action answered, from the page: the same on a scripted
    // submit and on a plain one.
    const answer = $derived(page.form as { action?: string; error?: string } | null);
    const pixError = $derived(
        answer?.action === 'savePayoutKey' && answer.error
            ? t('withdraw.errors.pixKeyInvalid')
            : null
    );
    const withdrawError = $derived(
        answer?.action === 'withdraw' && answer.error
            ? t(WITHDRAW_ERRORS[answer.error] ?? 'withdraw.errors.upstream')
            : null
    );
    const withdrawSuccess = $derived(answer?.action === 'withdraw' && !answer.error);

    function hoursSince(iso: string | null): number | null {
        if (!iso) return null;
        const ms = Date.now() - new Date(iso).getTime();
        return ms / 3_600_000;
    }

    function rateLimited(): boolean {
        const h = hoursSince(stats.totals.lastPayoutAt);
        return h !== null && h < RATE_LIMIT_HOURS;
    }

    function hoursRemaining(): number {
        const h = hoursSince(stats.totals.lastPayoutAt);
        return h === null ? 0 : Math.max(0, Math.ceil(RATE_LIMIT_HOURS - h));
    }

    function canSubmitWithdraw(): boolean {
        if (!pixKey) return false;
        if (rateLimited()) return false;
        if (amountCents <= 0) return false;
        if (amountCents > MAX_WITHDRAW_CENTS) return false;
        if (amountCents > stats.totals.availableToWithdrawCents) return false;
        return true;
    }

    const submitPixKey: SubmitFunction = () => {
        pixSaving = true;
        return async ({ result, update }) => {
            pixSaving = false;
            await update({ reset: false });
            if (result.type === 'success') editRequested = false;
        };
    };

    const submitWithdraw: SubmitFunction = () => {
        withdrawSubmitting = true;
        return async ({ result, update }) => {
            withdrawSubmitting = false;
            // Re-reads the balance, the daily limit and the history. `update`
            // only does that for a success, and a payout the provider refused
            // has left a failed row the history must show too.
            await update({ reset: false });
            if (result.type === 'success') amountCents = 0;
            else await invalidateAll();
        };
    };

    function payoutStatusKey(s: PayoutStatus): TranslationKey {
        return `withdraw.status.${s}` as TranslationKey;
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose();
    }

    function onBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) onClose();
    }
</script>

<svelte:window onkeydown={onKeydown} />

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
                <form
                    method="POST"
                    action={savePayoutKeyAction}
                    class="pix-form"
                    use:enhance={submitPixKey}
                >
                    <select
                        name="pix_key_type"
                        aria-label={t('withdraw.pixKeyType')}
                        value={stats.organization.pixKeyType ?? 'email'}
                    >
                        {#each PIX_TYPES as kt (kt)}
                            <option value={kt}
                                >{t(`withdraw.pixKeyTypes.${kt}` as TranslationKey)}</option
                            >
                        {/each}
                    </select>
                    <input
                        type="text"
                        name="pix_key"
                        required
                        maxlength="255"
                        aria-label={t('withdraw.pixKey')}
                        placeholder={t('withdraw.pixKey')}
                        value={pixKey ?? ''}
                    />
                    <button class="btn small" disabled={pixSaving}>
                        {t('withdraw.saveKey')}
                    </button>
                    {#if pixKey}
                        <button
                            type="button"
                            class="btn secondary small"
                            onclick={() => (editRequested = false)}
                            disabled={pixSaving}
                        >
                            {t('withdraw.cancel')}
                        </button>
                    {/if}
                </form>
                {#if pixError}<div class="error">{pixError}</div>{/if}
            {:else}
                <div class="row-between">
                    <div>
                        <strong>{pixKey}</strong>
                        <div class="muted small">
                            {t(
                                `withdraw.pixKeyTypes.${stats.organization.pixKeyType}` as TranslationKey
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="btn secondary small"
                        onclick={() => (editRequested = true)}
                    >
                        {t('withdraw.editKey')}
                    </button>
                </div>
            {/if}
        </section>

        <form
            method="POST"
            action={withdrawAction}
            class="withdraw-section"
            use:enhance={submitWithdraw}
        >
            <div class="muted small">
                {t('withdraw.available', {
                    amount: formatBRL(stats.totals.availableToWithdrawCents)
                })}
            </div>
            <div class="muted small">{t('withdraw.max')}</div>
            <input type="hidden" name="amount_cents" value={amountCents} />
            <label class="amount-field">
                <span>{t('withdraw.amount')}</span>
                <input
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCentsInput(amountCents)}
                    oninput={(e) => (amountCents = parseCentsInput(e.currentTarget.value))}
                    disabled={!pixKey || withdrawSubmitting || rateLimited()}
                />
            </label>
            {#if rateLimited()}
                <div class="muted small">
                    {t('withdraw.errors.rateLimited')} ({hoursRemaining()}h)
                </div>
            {/if}
            {#if withdrawError}<div class="error">{withdrawError}</div>{/if}
            {#if withdrawSuccess}<div class="success">{t('withdraw.success')}</div>{/if}
            <button class="btn" disabled={withdrawSubmitting || !canSubmitWithdraw()}>
                {withdrawSubmitting ? t('withdraw.submitting') : t('withdraw.submit')}
            </button>
        </form>

        <section class="withdraw-section">
            <div class="muted small">{t('withdraw.history')}</div>
            {#if payouts.length === 0}
                <p class="muted">{t('withdraw.noHistory')}</p>
            {:else}
                <ul class="payouts">
                    {#each payouts as p (p.id)}
                        <li>
                            <span>{formatDateTime(p.createdAt)}</span>
                            <span>{formatBRL(p.amountCents)}</span>
                            <span class="badge {p.status}">{t(payoutStatusKey(p.status))}</span>
                            {#if p.receiptUrl}
                                <a href={p.receiptUrl} target="_blank" rel="noopener">
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
