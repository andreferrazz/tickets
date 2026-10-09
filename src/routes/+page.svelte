<script lang="ts">
    import { replaceState } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import EventCard from '$lib/components/EventCard.svelte';
    import {
        filterHomeEvents,
        hasEventEnded,
        homeFiltersQuery
    } from '$lib/modules/events/home-filters';
    import { t } from '$lib/i18n';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Seeded from the query string the server parsed, then owned by the page:
    // the list is narrowed here, so ticking the box or typing shows the result
    // at once instead of waiting on a request per change. Deriving (rather than
    // plain state) resets them when a navigation brings new filters.
    let closed = $derived(data.filters.closed);
    let search = $derived(data.filters.search);
    const shownEvents = $derived(filterHomeEvents(data.events, { closed, search }));
    const countLabel = $derived(
        shownEvents.length === 1
            ? t('home.countOne')
            : t('home.countMany', { count: shownEvents.length })
    );

    // Read once: an event that ends while the page is open keeps its look until
    // the next visit, which beats cards changing under the visitor's cursor.
    const openedAt = Date.now();
    let searchBox: HTMLInputElement;

    // Keeps the address bar in step without re-running the load, so a reload or
    // a shared link still opens the same view. Not called per keystroke:
    // browsers throttle history writes.
    function rememberFilters() {
        const query = homeFiltersQuery({ closed, search });
        replaceState(resolve(`/${query}`), page.state);
    }

    function keepFiltersLocal(submit: SubmitEvent) {
        submit.preventDefault();
        rememberFilters();
    }

    function toggleClosed(change: Event & { currentTarget: HTMLInputElement }) {
        closed = change.currentTarget.checked;
        rememberFilters();
    }

    function clearSearch() {
        search = '';
        rememberFilters();
        searchBox.focus();
    }
</script>

<header class="hero">
    <h1>{t('home.title')}</h1>
    <p class="muted">{t('home.subtitle')}</p>
</header>

<!-- Without JavaScript this is still a plain GET form the server answers. -->
<form method="GET" class="filters" role="search" onsubmit={keepFiltersLocal}>
    <div class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
        <input
            bind:this={searchBox}
            name="search"
            type="text"
            inputmode="search"
            enterkeyhint="search"
            autocomplete="off"
            aria-label={t('home.searchLabel')}
            placeholder={t('home.searchPlaceholder')}
            value={search}
            oninput={(typed) => (search = typed.currentTarget.value)}
            onchange={rememberFilters}
        />
        {#if search}
            <button
                type="button"
                class="clear"
                aria-label={t('home.clearSearch')}
                title={t('home.clearSearch')}
                onclick={clearSearch}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
            </button>
        {/if}
    </div>
    <label class="closed-switch">
        <input type="checkbox" name="closed" value="1" checked={closed} onchange={toggleClosed} />
        {t('home.showClosed')}
    </label>
</form>

{#if data.loadFailed}
    <div class="error">{t('home.errorFallback')}</div>
{:else}
    <p class="count muted" aria-live="polite">{shownEvents.length > 0 ? countLabel : ''}</p>
    {#if shownEvents.length === 0}
        <div class="empty">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M3.5 10h17" />
            </svg>
            {#if search.trim()}
                <p class="empty-title">{t('home.noMatch', { search: search.trim() })}</p>
                <p class="muted">{t('home.noMatchHint')}</p>
                <button type="button" class="secondary" onclick={clearSearch}>
                    {t('home.clearSearch')}
                </button>
            {:else}
                <p class="empty-title">{t('home.noResults')}</p>
                <p class="muted">{t('home.emptyHint')}</p>
            {/if}
        </div>
    {:else}
        <div class="grid">
            {#each shownEvents as ev (ev.id)}
                <EventCard event={ev} ended={hasEventEnded(ev, openedAt)} />
            {/each}
        </div>
    {/if}
{/if}

<style>
    .hero {
        margin: 1.75rem 0 1.5rem;
    }
    .hero h1 {
        margin: 0 0 0.35rem;
        font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem);
        letter-spacing: -0.02em;
        line-height: 1.15;
    }
    .hero p {
        margin: 0;
        max-width: 38rem;
    }

    .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1.25rem;
    }
    .search-field {
        position: relative;
        flex: 1 1 18rem;
    }
    .search-field > svg {
        position: absolute;
        left: 0.9rem;
        top: 50%;
        width: 1.1rem;
        translate: 0 -50%;
        color: var(--muted);
        pointer-events: none;
    }
    .search-field svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
    }
    .search-field input {
        padding: 0.8rem 2.75rem;
        background: var(--surface);
        border-radius: 999px;
        box-shadow: 0 1px 2px rgb(15 23 42 / 0.05);
        transition:
            border-color 0.15s,
            box-shadow 0.15s;
    }
    .search-field input:focus {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
    }
    .clear {
        position: absolute;
        right: 0.45rem;
        top: 50%;
        translate: 0 -50%;
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--muted);
    }
    .clear:hover:not(:disabled) {
        background: var(--surface-2);
        color: var(--text);
    }
    .clear svg {
        width: 1rem;
    }

    /* Still a checkbox to assistive tech and to forms; only drawn as a switch. */
    .closed-switch {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0;
        padding: 0.4rem 0;
        cursor: pointer;
        user-select: none;
    }
    .closed-switch:hover {
        color: var(--text);
    }
    .closed-switch input {
        appearance: none;
        position: relative;
        flex: none;
        width: 2.5rem;
        height: 1.5rem;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: var(--border);
        cursor: pointer;
        transition: background 0.15s;
    }
    .closed-switch input::before {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: calc(1.5rem - 6px);
        aspect-ratio: 1;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgb(15 23 42 / 0.3);
        transition: translate 0.15s;
    }
    .closed-switch input:checked {
        background: var(--accent);
    }
    .closed-switch input:checked::before {
        translate: 1rem 0;
    }
    .closed-switch input:focus-visible,
    .clear:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .count {
        min-height: 1.3rem;
        margin: 1.25rem 0 0.6rem;
        font-size: 0.85rem;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 1.25rem;
    }

    .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.35rem;
        padding: 3rem 1rem;
        text-align: center;
        border: 1px dashed var(--border);
        border-radius: calc(var(--radius) + 4px);
    }
    .empty svg {
        width: 2.75rem;
        margin-bottom: 0.5rem;
        fill: none;
        stroke: var(--muted);
        stroke-width: 1.4;
        stroke-linecap: round;
        opacity: 0.7;
    }
    .empty p {
        margin: 0;
    }
    .empty-title {
        font-weight: 600;
        overflow-wrap: anywhere;
    }
    .empty button {
        margin-top: 0.9rem;
    }

    @media (prefers-reduced-motion: reduce) {
        .closed-switch input,
        .closed-switch input::before,
        .search-field input {
            transition: none;
        }
    }
</style>
