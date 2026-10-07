<script lang="ts">
    import { resolve } from '$app/paths';
    import { formatDateTime } from '$lib/utils/datetime';
    import { t } from '$lib/i18n';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<header class="hero">
    <h1>{t('scan.landingTitle')}</h1>
    <p class="muted">{t('scan.landingSubtitle')}</p>
</header>

{#if data.loadFailed}
    <div class="error">{t('scan.landingError')}</div>
{:else if data.events.length === 0}
    <p class="muted">{t('scan.landingEmpty')}</p>
{:else}
    <div class="stack">
        {#each data.events as ev (ev.id)}
            <a href={resolve('/events/[id]/scan', { id: ev.id })} class="line card">
                <div>
                    <strong>{ev.title}</strong>
                    <div class="muted small">{formatDateTime(ev.startsAt)} · {ev.location}</div>
                </div>
                <span class="btn small">{t('scan.openScanner')}</span>
            </a>
        {/each}
    </div>
{/if}

<style>
    .hero {
        margin: 1.5rem 0;
    }
    .line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        color: var(--text);
    }
    .small {
        font-size: 0.85rem;
    }
</style>
