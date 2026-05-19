<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	const ONBOARDING_KEY = 'tickets.onboarding_org';
	const PENDING_NEXT_KEY = 'tickets.pending_next';

	let error = $state<string | null>(null);

	onMount(async () => {
		const token = page.params.token!;
		try {
			const res = await api.acceptInvitation(token);
			auth.set(res.token, res.user);
			// Admin-invited leaders land on the rename form; their org was
			// auto-named "<email-local-part>'s Org" and they should set it
			// before doing anything else. Participants skip straight home.
			if (res.organization?.role === 'leader') {
				const onboardingPath = `/onboarding/organization/${res.organization.id}`;
				sessionStorage.setItem(
					ONBOARDING_KEY,
					JSON.stringify({ id: res.organization.id, name: res.organization.name })
				);
				// The layout's profile-completion gate redirects authed users
				// with incomplete profiles to /auth/profile. Stash the
				// onboarding URL so the profile page forwards us there once
				// the user finishes their basics.
				if (!res.user.profile_complete) {
					sessionStorage.setItem(PENDING_NEXT_KEY, onboardingPath);
				}
				await goto(onboardingPath);
			} else {
				await goto('/');
			}
		} catch (e) {
			error = mapError(e);
		}
	});

	function mapError(e: unknown): string {
		if (!(e instanceof ApiError)) return t('invite.errorFallback');
		switch (e.message) {
			case 'expired':
				return t('invite.errorExpired');
			case 'invalid_token':
				return t('invite.errorInvalid');
			case 'already_accepted':
				return t('invite.errorAlreadyAccepted');
			default:
				return t('invite.errorFallback');
		}
	}
</script>

<div class="invite-wrap">
	<div class="card stack">
		{#if error}
			<h1>{t('invite.errorTitle')}</h1>
			<p class="error">{error}</p>
			<a href="/auth/login">{t('invite.goLogin')}</a>
		{:else}
			<p>{t('invite.accepting')}</p>
		{/if}
	</div>
</div>

<style>
	.invite-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
</style>
