<script lang="ts">
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	// Closed events are served by the load function but hidden until the user opts in.
	let showClosed = $state(false);

	const filtered = $derived.by(() => {
		const q = query.toLowerCase();
		return data.events.filter((e) => {
			if (!showClosed && e.status === 'closed') return false;
			if (!q) return true;
			return e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q);
		});
	});
</script>

<header class="hero">
	<h1>{t('home.title')}</h1>
	<p class="muted">{t('home.subtitle')}</p>
</header>

<div class="search-bar">
	<input placeholder={t('home.searchPlaceholder')} bind:value={query} />
</div>

<label class="check show-closed">
	<input type="checkbox" bind:checked={showClosed} />
	{t('home.showClosed')}
</label>

{#if data.loadFailed}
	<div class="error">{t('home.errorFallback')}</div>
{:else if filtered.length === 0}
	<p class="muted">{t('home.noResults')}</p>
{:else}
	<div class="grid">
		{#each filtered as ev (ev.id)}
			<a href="/events/{ev.id}" class="event-card">
				{#if ev.cover_image_url}
					<img src={ev.cover_image_url} alt="" loading="lazy" />
				{:else}
					<div class="cover-placeholder">🎟</div>
				{/if}
				<div class="event-body">
					{#if ev.status !== 'published'}
						<span class="badge {ev.status}">{tStatus(ev.status)}</span>
					{/if}
					<h3>{ev.title}</h3>
					<p class="muted small">{formatDateTime(ev.starts_at)}</p>
					<p class="muted small">{ev.location}</p>
				</div>
			</a>
		{/each}
	</div>
{/if}

<style>
	.hero {
		margin: 1.5rem 0;
	}
	.search-bar {
		margin-bottom: 0.75rem;
	}
	.show-closed {
		margin-bottom: 1rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.check input {
		width: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}
	.event-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		color: var(--text);
		transition: transform 0.15s, border-color 0.15s;
		display: flex;
		flex-direction: column;
	}
	.event-card:hover {
		transform: translateY(-2px);
		border-color: var(--accent);
	}
	.event-card img {
		width: 100%;
		aspect-ratio: 16/9;
		object-fit: cover;
	}
	.cover-placeholder {
		width: 100%;
		aspect-ratio: 16/9;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3rem;
		background: var(--surface-2);
	}
	.event-body {
		padding: 0.9rem;
	}
	.event-body .badge {
		margin-bottom: 0.5rem;
	}
	.event-body h3 {
		font-size: 1.05rem;
		margin: 0 0 0.4rem;
	}
	.small {
		font-size: 0.85rem;
		margin: 0.15rem 0;
	}
</style>
