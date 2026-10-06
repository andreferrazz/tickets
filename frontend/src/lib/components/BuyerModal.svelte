<script lang="ts">
    import { t } from '$lib/i18n';
    import type { ItemBuyerDto } from '$lib/modules/events/stats-types';

    export type BuyerKind = 'extra' | 'ticket';
    export type BuyerTarget = { kind: BuyerKind; id: string; name: string };

    // Presentational: the dashboard load supplies the rows for the item named in
    // the URL, so nothing here fetches.
    type Props = {
        target: BuyerTarget | null;
        buyers: ItemBuyerDto[] | null;
        onClose: () => void;
    };

    let { target, buyers, onClose }: Props = $props();

    function onKeydown(e: KeyboardEvent) {
        if (target && e.key === 'Escape') onClose();
    }

    function onBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) onClose();
    }
</script>

<svelte:window on:keydown={onKeydown} />

{#if target}
    <div class="backdrop" onclick={onBackdropClick} role="presentation">
        <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="buyers-title">
            <div class="dialog-head">
                <h3 id="buyers-title">
                    {t(
                        target.kind === 'ticket'
                            ? 'dashboard.ticketBuyers'
                            : 'dashboard.extraBuyers',
                        {
                            name: target.name
                        }
                    )}
                </h3>
                <button type="button" class="secondary small" onclick={onClose}>
                    {t('dashboard.close')}
                </button>
            </div>
            {#if !buyers || buyers.length === 0}
                <p class="muted">{t('dashboard.noBuyers')}</p>
            {:else}
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('dashboard.buyerName')}</th>
                                <th>{t('dashboard.buyerTaxId')}</th>
                                <th class="num-col">{t('dashboard.buyerQty')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each buyers as b (b.email)}
                                <tr>
                                    <td>{b.name ?? b.email}</td>
                                    <td>{b.taxId ?? '—'}</td>
                                    <td class="num-col">{b.quantity}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <div class="total-row">
                    <span>{t('common.total')}</span>
                    <span class="num-col">
                        {buyers.reduce((sum, b) => sum + b.quantity, 0)}
                    </span>
                </div>
            {/if}
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
    .table-wrap {
        overflow: auto;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    th,
    td {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--border);
        text-align: left;
    }
    th {
        font-size: 0.85rem;
        color: var(--muted);
        font-weight: 600;
    }
    .total-row {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem;
        border-top: 2px solid var(--border);
        font-weight: 600;
    }
    .num-col {
        text-align: right;
    }
</style>
