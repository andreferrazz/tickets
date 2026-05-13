<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		if (!auth.isAuthed) goto('/auth/login');
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

<h1>{t('profile.title')}</h1>
{#if auth.user}
	<div class="card stack" style="max-width: 480px;">
		<div>
			<div class="muted small">{t('profile.email')}</div>
			<strong>{auth.user.email}</strong>
		</div>
		<div>
			<div class="muted small">{t('profile.role')}</div>
			<span class="badge published">{tStatus(auth.user.role)}</span>
		</div>
		<button class="danger" onclick={logout}>{t('profile.logout')}</button>
	</div>
{/if}

<style>
	.small {
		font-size: 0.8rem;
	}
</style>
