<script lang="ts">
	import '../app.css';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { api } from '$lib/api';
	import { t } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PromptDialog from '$lib/components/PromptDialog.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { loginModalStore } from '$lib/stores/loginModal.svelte';

	let { children } = $props();

	let menuOpen = $state(false);

	// Collapse the mobile menu after navigating so the panel doesn't linger
	// over the new page.
	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});

	// Force authed users to complete their profile before navigating anywhere
	// other than the auth flow. Keys off profile_complete (not abacate_customer_id)
	// so an Abacate outage doesn't trap users in this redirect.
	$effect(() => {
		if (!auth.isAuthed || !auth.user) return;
		if (auth.user.profile_complete === true) return;
		if (page.url.pathname.startsWith('/auth/')) return;
		// The login modal handles profile completion in-page; don't yank the user away.
		if (loginModalStore.open) return;
		goto('/auth/profile');
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
		<button
			class="secondary small nav-toggle"
			aria-expanded={menuOpen}
			aria-controls="nav-links"
			aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
			onclick={() => (menuOpen = !menuOpen)}
		>
			{menuOpen ? '✕' : '☰'}
		</button>
		<div id="nav-links" class="nav-links" class:open={menuOpen}>
			<a href="/" class:active={page.url.pathname === '/'}>{t('nav.events')}</a>
			{#if auth.isAuthed}
				<a href="/orders" class:active={page.url.pathname.startsWith('/orders')}
					>{t('nav.myOrders')}</a
				>
				{#if auth.isCreator}
					<a href="/events/new">{t('nav.newEvent')}</a>
				{/if}
				{#if auth.isAdmin}
					<a href="/admin/invitations">{t('nav.invitations')}</a>
				{/if}
				<a href="/profile" class="who">{auth.user?.email}</a>
				<button class="secondary small" onclick={logout}>{t('nav.logout')}</button>
			{:else}
				<a href="/auth/login" class="btn small">{t('nav.login')}</a>
			{/if}
			<button
				class="secondary small theme-toggle"
				title={theme.current === 'dark' ? t('theme.toggleToLight') : t('theme.toggleToDark')}
				aria-label={theme.current === 'dark' ? t('theme.toggleToLight') : t('theme.toggleToDark')}
				onclick={() => theme.toggle()}
			>
				{theme.current === 'dark' ? '☀' : '☾'}
			</button>
		</div>
	</div>
</nav>

<main class="container">
	{@render children()}
</main>

<ConfirmDialog />
<PromptDialog />
<LoginModal />

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
	.nav-toggle {
		display: none;
		min-width: 2.4rem;
		font-size: 1.1rem;
		line-height: 1;
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
		color: var(--accent-contrast);
	}
	.theme-toggle {
		min-width: 2.2rem;
		line-height: 1;
	}
	.who {
		font-size: 0.85rem !important;
	}
	:global(button.small),
	:global(.btn.small) {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.nav-toggle {
			display: inline-flex;
			align-items: center;
			justify-content: center;
		}
		.nav-links {
			display: none;
			flex-direction: column;
			align-items: stretch;
			gap: 0.25rem;
			flex-basis: 100%;
			padding-top: 0.5rem;
		}
		.nav-links.open {
			display: flex;
		}
		/* Let each entry fill the dropdown width so taps land easily. */
		.nav-links :global(a),
		.nav-links :global(button) {
			width: 100%;
			text-align: left;
		}
		.who {
			order: 1;
		}
	}
</style>
