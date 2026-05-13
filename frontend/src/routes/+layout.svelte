<script lang="ts">
	import '../app.css';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api';
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});

	async function logout() {
		try {
			await api.logout();
		} catch {
			/* ignore */
		}
		auth.clear();
		await goto('/');
	}
</script>

<nav class="nav">
	<div class="nav-inner">
		<a href="/" class="brand">🎟 Tickets</a>
		<div class="nav-links">
			<a href="/" class:active={page.url.pathname === '/'}>{t('nav.events')}</a>
			{#if auth.isAuthed}
				<a href="/orders" class:active={page.url.pathname.startsWith('/orders')}
					>{t('nav.myOrders')}</a
				>
				{#if auth.isCreator}
					<a href="/events/new">{t('nav.newEvent')}</a>
					<a href="/admin/invitations">{t('nav.invitations')}</a>
				{/if}
				<a href="/profile" class="who">{auth.user?.email}</a>
				<button class="secondary small" onclick={logout}>{t('nav.logout')}</button>
			{:else}
				<a href="/auth/login" class="btn small">{t('nav.login')}</a>
			{/if}
		</div>
	</div>
</nav>

<main class="container">
	{@render children()}
</main>

<style>
	.nav {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.nav-inner {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0.75rem 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--text);
	}
	.nav-links {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.nav-links :global(a) {
		color: var(--muted);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius);
		font-size: 0.95rem;
	}
	.nav-links :global(a.active) {
		color: var(--text);
		background: var(--surface-2);
	}
	.nav-links :global(a.btn) {
		color: #0f172a;
	}
	.who {
		font-size: 0.85rem !important;
	}
	:global(button.small),
	:global(.btn.small) {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
	}
</style>
