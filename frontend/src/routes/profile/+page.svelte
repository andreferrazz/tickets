<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { OrganizationMembership } from '$lib/types';
	import { onMount } from 'svelte';

	type Role = OrganizationMembership['role'];

	// Force a refresh so the profile page reflects org renames done elsewhere
	// in the session. The auth store caches and exposes the result reactively.
	let orgsError = $state<string | null>(null);
	const memberships = $derived(auth.memberships);

	onMount(async () => {
		if (!auth.isAuthed) {
			goto('/auth/login');
			return;
		}
		try {
			await auth.loadMemberships(true);
		} catch (e) {
			orgsError = e instanceof ApiError ? e.message : t('profile.orgs.errorFallback');
		}
	});

	async function logout() {
		try {
			await api.logout();
		} catch {
			/* ignore */
		}
		await auth.clear();
		await goto('/');
	}

	function roleLabel(role: Role): string {
		if (role === 'leader') return t('profile.orgs.roleLeader');
		if (role === 'staff') return t('profile.orgs.roleStaff');
		return t('profile.orgs.roleParticipant');
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

		<div>
			<div class="muted small">{t('profile.orgs.title')}</div>
			{#if orgsError}
				<div class="error">{orgsError}</div>
			{:else if memberships === null}
				<div class="muted small">{t('common.loading')}</div>
			{:else if memberships.length === 0}
				<div class="muted small">{t('profile.orgs.empty')}</div>
			{:else}
				<ul class="orgs">
					{#each memberships as m (m.id)}
						<li>
							<span class="org-name">{m.name}</span>
							<span class="org-meta">
								<span class="badge" class:leader={m.role === 'leader'}
									>{roleLabel(m.role)}</span
								>
								{#if m.role === 'leader' || m.role === 'participant'}
									<a class="manage" href="/organizations/{m.id}/invitations"
										>{t('profile.orgs.manageInvites')}</a
									>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<button class="danger" onclick={logout}>{t('profile.logout')}</button>
	</div>
{/if}

<style>
	.small {
		font-size: 0.8rem;
	}
	.orgs {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.orgs li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}
	.org-name {
		font-weight: 500;
	}
	.org-meta {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}
	.manage {
		font-size: 0.85rem;
	}
	.badge.leader {
		background: var(--tone-info-bg);
		color: var(--tone-info-fg);
	}
</style>
