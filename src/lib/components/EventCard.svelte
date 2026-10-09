<script lang="ts">
    import { resolve } from '$app/paths';
    import { t, tStatus } from '$lib/i18n';
    import type { EventDto } from '$lib/modules/events/types';
    import { eventDateParts } from '$lib/utils/datetime';

    let { event, ended }: { event: EventDto; ended: boolean } = $props();

    const when = $derived(eventDateParts(event.startsAt));
    // A status the visitor should know about wins over "already happened":
    // a closed or draft event says more than its date does.
    const flag = $derived.by(() => {
        if (event.status !== 'published')
            return { tone: event.status, text: tStatus(event.status) };
        if (ended) return { tone: 'ended', text: t('home.eventEnded') };
        return null;
    });
</script>

<a href={resolve('/events/[id]', { id: event.id })} class="event-card" class:faded={flag !== null}>
    <div class="cover">
        {#if event.coverImageUrl}
            <img src={event.coverImageUrl} alt="" loading="lazy" />
        {:else}
            <svg class="cover-mark" viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6Z"
                />
                <path d="M14 5v14" stroke-dasharray="2 2.5" />
            </svg>
        {/if}
        <time class="date" datetime={event.startsAt}>
            <span class="day">{when.day}</span>
            <span class="month">{when.month}</span>
            <span class="year">{when.year}</span>
        </time>
        {#if flag}
            <span class="badge flag {flag.tone}">{flag.text}</span>
        {/if}
    </div>
    <div class="body">
        <h2>{event.title}</h2>
        <p class="detail">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
            <span>{when.weekday} · {when.time}</span>
        </p>
        {#if event.location}
            <p class="detail">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s7-6.1 7-11.5a7 7 0 1 0-14 0C5 14.9 12 21 12 21Z" />
                    <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                <span>{event.location}</span>
            </p>
        {/if}
    </div>
</a>

<style>
    .event-card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--surface);
        border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
        border-radius: calc(var(--radius) + 4px);
        color: var(--text);
        box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
        transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
    }
    .event-card:hover,
    .event-card:focus-visible {
        color: var(--text);
        transform: translateY(-3px);
        border-color: var(--accent);
        box-shadow: 0 14px 28px -14px rgb(15 23 42 / 0.35);
    }
    .event-card:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .cover {
        position: relative;
        aspect-ratio: 16 / 9;
        display: grid;
        place-items: center;
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--accent) 30%, var(--surface-2)),
            var(--surface-2) 70%
        );
    }
    .cover img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
    }
    .event-card:hover .cover img {
        transform: scale(1.04);
    }
    .cover-mark {
        width: 3.25rem;
        fill: none;
        stroke: color-mix(in srgb, var(--accent) 55%, var(--muted));
        stroke-width: 1.2;
        stroke-linejoin: round;
        opacity: 0.7;
    }
    .faded .cover img,
    .faded .cover-mark {
        filter: grayscale(0.85);
        opacity: 0.6;
    }

    .date {
        position: absolute;
        left: 0.75rem;
        bottom: 0.75rem;
        min-width: 3.1rem;
        padding: 0.35rem 0.5rem 0.4rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.05;
        background: var(--surface);
        border-radius: var(--radius);
        box-shadow: 0 4px 12px -4px rgb(15 23 42 / 0.3);
    }
    .day {
        font-size: 1.3rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
    .month {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
    }
    .year {
        margin-top: 0.1rem;
        font-size: 0.65rem;
        color: var(--muted);
    }

    .flag {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        box-shadow: 0 2px 8px -2px rgb(15 23 42 / 0.3);
    }
    .flag.ended,
    .flag.draft {
        background: var(--surface);
        color: var(--muted);
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.9rem 1rem 1.1rem;
    }
    h2 {
        margin: 0 0 0.25rem;
        font-size: 1.05rem;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        overflow: hidden;
    }
    .detail {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        min-width: 0;
        font-size: 0.85rem;
        color: var(--muted);
    }
    .detail svg {
        flex: none;
        width: 0.95rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
    .detail span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
        .event-card,
        .cover img {
            transition: none;
        }
        .event-card:hover,
        .event-card:focus-visible,
        .event-card:hover .cover img {
            transform: none;
        }
    }
</style>
