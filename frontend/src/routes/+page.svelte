<script lang="ts">
	import { api, ApiError, formatDate } from '$lib/api';
	import { t, tStatus } from '$lib/i18n';
	import type { Event } from '$lib/types';
	import { onMount } from 'svelte';

	let events = $state<Event[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let query = $state('');

	const filtered = $derived(
		query
			? events.filter(
					(e) =>
						e.title.toLowerCase().includes(query.toLowerCase()) ||
						e.location.toLowerCase().includes(query.toLowerCase())
				)
			: events
	);

	onMount(async () => {
		try {
			events = await api.listEvents();
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('home.errorFallback');
		} finally {
			loading = false;
		}
	});
</script>

<header class="hero">
	<h1>{t('home.title')}</h1>
	<p class="muted">{t('home.subtitle')}</p>
</header>

<div class="search-bar">
	<input placeholder={t('home.searchPlaceholder')} bind:value={query} />
</div>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
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
					<p class="muted small">{formatDate(ev.starts_at)}</p>
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
		margin-bottom: 1rem;
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
