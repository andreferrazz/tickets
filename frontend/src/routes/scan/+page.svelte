<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatDateTime } from '$lib/utils/datetime';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Event } from '$lib/types';
	import { onMount } from 'svelte';

	let events = $state<Event[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login?next=/scan');
			return;
		}
		try {
			const memberships = await auth.loadMemberships();
			const orgIds = new Set(memberships.map((m) => m.id));
			// list_events already returns the user's org events (incl. drafts), so
			// filtering by membership org id yields exactly the events they can scan.
			const all = await api.listEvents();
			events = all.filter((e) => orgIds.has(e.organization_id));
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('scan.errorFallback');
		} finally {
			loading = false;
		}
	});
</script>

<header class="hero">
	<h1>{t('scan.landingTitle')}</h1>
	<p class="muted">{t('scan.landingSubtitle')}</p>
</header>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else if events.length === 0}
	<p class="muted">{t('scan.landingEmpty')}</p>
{:else}
	<div class="stack">
		{#each events as ev (ev.id)}
			<a href="/events/{ev.id}/scan" class="line card">
				<div>
					<strong>{ev.title}</strong>
					<div class="muted small">{formatDateTime(ev.starts_at)} · {ev.location}</div>
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
