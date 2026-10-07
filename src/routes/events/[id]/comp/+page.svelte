<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { t } from '$lib/i18n';
    import type { TranslationKey } from '$lib/i18n/pt';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    interface Row {
        email: string;
        quantity: number;
    }

    const emptyRow = (): Row => ({ email: '', quantity: 1 });

    let rows = $state<Row[]>([emptyRow()]);
    let sending = $state(false);

    // Server-rendered: an event this visitor may not manage never reaches this
    // component. Only ticket types with an open batch can be given away; the
    // server resolves the batch on sale and would refuse the rest as sold out.
    const availableTypes = $derived(
        (data.event?.ticketTypes ?? []).filter((ticketType) => ticketType.activeBatch)
    );
    const hasRecipients = $derived(rows.some((row) => row.email.trim() !== ''));
    const summary = $derived(form?.summary ?? null);

    const REASONS: Record<string, TranslationKey> = {
        invalid_email: 'comp.error.invalid_email',
        invalid_quantity: 'comp.error.invalid_quantity',
        out_of_stock: 'comp.error.out_of_stock',
        invalid_item: 'comp.error.invalid_item',
        event_not_available: 'comp.error.event_not_available',
        not_found: 'comp.error.not_found',
        no_recipients: 'comp.needRecipients'
    };

    function reasonLabel(reason: string): string {
        return t(REASONS[reason] ?? 'comp.error.generic');
    }

    function addRow() {
        rows = [...rows, emptyRow()];
    }

    function removeRow(index: number) {
        rows = rows.filter((_, i) => i !== index);
        if (rows.length === 0) rows = [emptyRow()];
    }

    const submitSend: SubmitFunction = () => {
        sending = true;
        return async ({ result, update }) => {
            sending = false;
            // The typed list survives a partial send so the failures can be fixed.
            await update({ reset: false });
            const sent = result.type === 'success' && result.data?.summary?.failed.length === 0;
            if (sent) rows = [emptyRow()];
        };
    };
</script>

<header class="head">
    <h1>{t('comp.title')}</h1>
    <a href={resolve('/events/[id]/dashboard', { id: page.params.id! })} class="btn secondary small"
        >←</a
    >
</header>

{#if data.loadFailed}
    <div class="error">{t('comp.errorFallback')}</div>
{:else}
    <p class="muted subtitle">{t('comp.subtitle')}</p>

    {#if availableTypes.length === 0}
        <p class="muted">{t('comp.noTicketTypes')}</p>
    {:else}
        <form method="POST" action="?/send" class="card form" use:enhance={submitSend}>
            <label class="field">
                <span>{t('comp.ticketType')}</span>
                <select name="ticket_type_id">
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
                                name="email"
                                class="email"
                                placeholder={t('comp.emailPlaceholder')}
                                bind:value={row.email}
                            />
                            <input
                                type="number"
                                name="quantity"
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

            {#if form?.error}
                <div class="error">{reasonLabel(form.error)}</div>
            {/if}

            <button class="btn" disabled={sending || !hasRecipients}>
                {sending ? t('comp.sending') : t('comp.send')}
            </button>
        </form>
    {/if}

    {#if summary}
        <div class="card result">
            {#if summary.sent.length > 0}
                <h3>{t('comp.sentTitle', { count: summary.sent.length })}</h3>
                <ul class="sent">
                    {#each summary.sent as email, i (i)}
                        <li>{email}</li>
                    {/each}
                </ul>
            {/if}
            {#if summary.failed.length > 0}
                <h3>{t('comp.failedTitle', { count: summary.failed.length })}</h3>
                <ul class="failed">
                    {#each summary.failed as row, i (i)}
                        <li>
                            <span class="email">{row.email}</span> — {reasonLabel(row.error)}
                        </li>
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
