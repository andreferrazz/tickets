<script lang="ts">
    import { resolve } from '$app/paths';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { formatBRL } from '$lib/utils/currency';
    import BuyerModal, { type BuyerTarget } from '$lib/components/BuyerModal.svelte';
    import WithdrawModal from '$lib/components/WithdrawModal.svelte';
    import { formatDateTime } from '$lib/utils/datetime';
    import { t, tStatus } from '$lib/i18n';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Server-rendered: an event this visitor may not manage never reaches this
    // component; the load function answers 404 instead.
    const stats = $derived(data.stats);

    function pct(sold: number, capacity: number | null): number {
        if (!capacity || capacity <= 0) return 0;
        return Math.min(100, Math.round((sold / capacity) * 100));
    }

    // The buyers list is part of the page data, keyed by the `buyers` query
    // parameter, so opening it is a navigation the server renders rather than a
    // fetch after hydration.
    function openBuyers(target: BuyerTarget) {
        const url = new URL(page.url);
        url.searchParams.set('buyers', `${target.kind}:${target.id}`);
        goto(url, { noScroll: true, keepFocus: true });
    }

    function closeBuyers() {
        const url = new URL(page.url);
        url.searchParams.delete('buyers');
        goto(url, { noScroll: true, keepFocus: true });
    }

    // The withdraw dialog is open while the URL says so, like the buyers list:
    // the load only hands over `payouts` for a leader who asked for it.
    function closeWithdraw() {
        const url = new URL(page.url);
        url.searchParams.delete('withdraw');
        goto(url, { noScroll: true, keepFocus: true });
    }

    function onTicketCardKey(e: KeyboardEvent, ttId: string, ttName: string) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openBuyers({ kind: 'ticket', id: ttId, name: ttName });
        }
    }
</script>

{#if !stats}
    <div class="error">{t('dashboard.errorFallback')}</div>
{:else}
    <header class="head">
        <h1>{t('dashboard.title')}</h1>
        <div class="head-actions">
            <a
                href={resolve('/organizations/[id]/invitations', { id: stats.organization.id })}
                class="btn secondary small"
            >
                {t('dashboard.manageInvitations')}
            </a>
            <a href={resolve('/events/[id]', { id: stats.eventId })} class="btn secondary small"
                >←</a
            >
        </div>
    </header>

    <section class="kpis">
        <div class="card kpi">
            <div class="muted small">{t('dashboard.revenue')}</div>
            <strong class="big">{formatBRL(stats.totals.revenueCents)}</strong>
            <div class="muted small">{t('dashboard.revenueHint')}</div>
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.netRevenue')}</div>
            <strong class="big">{formatBRL(stats.totals.netRevenueCents)}</strong>
            <div class="muted small">
                {t('dashboard.feesDeducted', { amount: formatBRL(stats.totals.feesCents) })}
            </div>
            <div class="muted small">{t('dashboard.netRevenueHint')}</div>
            <!-- Withdraw ("Sacar dinheiro") button hidden for now. The dialog it
                 opens works and is reachable at `?withdraw=1`; unhide this to offer it. -->
            <!-- {#if stats.canWithdraw}
				<a class="btn small withdraw-btn" href="?withdraw=1" data-sveltekit-noscroll>
					{t('dashboard.withdraw')}
				</a>
			{/if} -->
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.ticketsReserved')}</div>
            <strong class="big">
                {stats.totals.ticketsSold}<span class="muted">/{stats.totals.ticketsCapacity}</span>
            </strong>
            <div class="bar">
                <div
                    class="bar-fill"
                    style="width: {pct(stats.totals.ticketsSold, stats.totals.ticketsCapacity)}%"
                ></div>
            </div>
            <div class="muted small">{t('dashboard.ticketsReservedHint')}</div>
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.extrasSold')}</div>
            <strong class="big">{stats.totals.extrasSold}</strong>
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.checkIns')}</div>
            <strong class="big">
                {stats.totals.passesCheckedIn}<span class="muted">/{stats.totals.passesIssued}</span
                >
            </strong>
            <div class="bar">
                <div
                    class="bar-fill"
                    style="width: {pct(stats.totals.passesCheckedIn, stats.totals.passesIssued)}%"
                ></div>
            </div>
            <div class="muted small">{t('dashboard.checkInsHint')}</div>
            <a
                href={resolve('/events/[id]/scan', { id: stats.eventId })}
                class="btn small scan-btn"
            >
                {t('dashboard.scanTickets')}
            </a>
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.ordersPaid')}</div>
            <strong class="big">{stats.totals.ordersPaid}</strong>
            <a
                href={resolve('/events/[id]/orders', { id: stats.eventId })}
                class="btn small view-orders-btn"
            >
                {t('dashboard.viewOrders')}
            </a>
            <a
                href={resolve('/events/[id]/comp', { id: stats.eventId })}
                class="btn small secondary view-orders-btn"
            >
                {t('dashboard.sendComp')}
            </a>
        </div>
        <div class="card kpi">
            <div class="muted small">{t('dashboard.ordersPending')}</div>
            <strong class="big">{stats.totals.ordersPending}</strong>
        </div>
    </section>

    <section class="block">
        <h2>{t('dashboard.byTicketType')}</h2>
        {#if stats.ticketTypes.length === 0}
            <p class="muted">{t('dashboard.noTicketTypes')}</p>
        {:else}
            <div class="stack">
                {#each stats.ticketTypes as tt (tt.id)}
                    <div
                        class="card ticket-row"
                        role="button"
                        tabindex="0"
                        onclick={() => openBuyers({ kind: 'ticket', id: tt.id, name: tt.name })}
                        onkeydown={(e) => onTicketCardKey(e, tt.id, tt.name)}
                    >
                        <div class="row-between">
                            <div>
                                <strong>{tt.name}</strong>
                                <div class="muted small">
                                    {tt.sold}/{tt.capacity} · {formatBRL(tt.revenueCents)}
                                </div>
                            </div>
                            <div class="bar wide">
                                <div
                                    class="bar-fill"
                                    style="width: {pct(tt.sold, tt.capacity)}%"
                                ></div>
                            </div>
                        </div>
                        {#if tt.batches.length > 0}
                            <ul class="batches">
                                {#each tt.batches as b (b.id)}
                                    <li>
                                        <span class="badge">{b.label}</span>
                                        <span>{b.sold}/{b.capacity}</span>
                                        <span class="muted small">{formatBRL(b.priceCents)}</span>
                                        {#if b.closedAt}
                                            <span class="badge sold-out"
                                                >{t('dashboard.closed')}</span
                                            >
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    {#if stats.extras.length > 0}
        <section class="block">
            <h2>{t('dashboard.byExtra')}</h2>
            <div class="stack">
                {#each stats.extras as x (x.id)}
                    <button
                        type="button"
                        class="card row-between extra-row"
                        onclick={() => openBuyers({ kind: 'extra', id: x.id, name: x.name })}
                    >
                        <div>
                            <strong>{x.name}</strong>
                            <div class="muted small">{x.sectionTitle}</div>
                        </div>
                        <div class="num">
                            <div>
                                {x.sold}{#if x.capacity !== null}/{x.capacity}{:else}
                                    <span class="muted small"> · {t('dashboard.unlimited')}</span>
                                {/if}
                            </div>
                            <div class="muted small">{formatBRL(x.revenueCents)}</div>
                        </div>
                    </button>
                {/each}
            </div>
        </section>
    {/if}

    <section class="block">
        <h2>{t('dashboard.recentOrders')}</h2>
        {#if stats.recentOrders.length === 0}
            <p class="muted">{t('dashboard.noOrdersYet')}</p>
        {:else}
            <div class="stack">
                {#each stats.recentOrders as o (o.id)}
                    <div class="card row-between">
                        <div>
                            <strong>{o.buyerEmail}</strong>
                            <div class="muted small">
                                {formatDateTime(o.createdAt)} · {o.itemCount}
                                {t('dashboard.items')}
                            </div>
                        </div>
                        <div class="num">
                            <span class="badge {o.status}">{tStatus(o.status)}</span>
                            <div>{formatBRL(o.totalCents)}</div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </section>
{/if}

{#if stats && data.payouts}
    <WithdrawModal {stats} payouts={data.payouts} onClose={closeWithdraw} />
{/if}
<BuyerModal
    target={data.buyers?.target ?? null}
    buyers={data.buyers?.rows ?? null}
    onClose={closeBuyers}
/>

<style>
    .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 1rem 0 1.5rem;
    }
    .head-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.75rem;
    }
    .kpi {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .big {
        font-size: 1.5rem;
    }
    .small {
        font-size: 0.85rem;
    }
    .block {
        margin-top: 2rem;
    }
    .row-between {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }
    .bar {
        height: 6px;
        background: var(--surface-2);
        border-radius: 999px;
        overflow: hidden;
        margin-top: 0.25rem;
    }
    .bar.wide {
        flex: 1;
        max-width: 240px;
    }
    .bar-fill {
        height: 100%;
        background: var(--accent);
    }
    .batches {
        list-style: none;
        padding: 0;
        margin: 0.75rem 0 0;
        display: grid;
        gap: 0.4rem;
    }
    .batches li {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.4rem 0.6rem;
        background: var(--surface-2);
        border-radius: var(--radius);
        font-size: 0.9rem;
    }
    .num {
        text-align: right;
    }
    .extra-row {
        display: flex;
        width: 100%;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
    }
    .extra-row:hover {
        background: var(--surface-2);
    }
    .ticket-row {
        cursor: pointer;
    }
    .ticket-row:hover {
        background: var(--surface-2);
    }
    .ticket-row:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }
    .withdraw-btn {
        margin-top: 0.5rem;
        align-self: flex-start;
    }
    .view-orders-btn {
        margin-top: 0.5rem;
        align-self: flex-start;
    }
    .scan-btn {
        margin-top: 0.5rem;
        align-self: flex-start;
    }
</style>
