<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	let error = $state<string | null>(null);

	onMount(async () => {
		const token = page.url.searchParams.get('token');
		if (!token) {
			error = t('impersonate.errorFallback');
			return;
		}
		// Set the token first so api.me() sends it as the Bearer header; the token
		// is already a valid session minted by the admin, so /me resolves the
		// target user. Persist both once we have the user.
		auth.token = token;
		try {
			const user = await api.me();
			auth.set(token, user);
			await goto('/');
		} catch {
			auth.clear();
			error = t('impersonate.errorFallback');
		}
	});
</script>

<div class="impersonate-wrap">
	<div class="card stack">
		{#if error}
			<h1>{t('impersonate.errorTitle')}</h1>
			<p class="error">{error}</p>
			<a href="/auth/login">{t('impersonate.goLogin')}</a>
		{:else}
			<p>{t('impersonate.loading')}</p>
		{/if}
	</div>
</div>

<style>
	.impersonate-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
</style>
