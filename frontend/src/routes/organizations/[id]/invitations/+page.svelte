<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import { formatDateTime } from '$lib/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
	import type { Invitation, OrganizationMembership, OrgMember, OrgRole } from '$lib/types';
	import { onMount } from 'svelte';

	const orgId = $derived(page.params.id);

	let membership = $state<OrganizationMembership | null>(null);
	let invitations = $state<Invitation[]>([]);
	let members = $state<OrgMember[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let email = $state('');
	let inviteRole = $state<OrgRole>('participant');
	let sendError = $state<string | null>(null);
	let busy = $state(false);
	let memberError = $state<string | null>(null);

	const visible = $derived(invitations.filter((i) => i.organization_id === orgId));
	// Managers (leader + participant) see the member list and may change roles and
	// remove members. The leader row is protected; staff manage nothing.
	const isManager = $derived(
		membership?.role === 'leader' || membership?.role === 'participant'
	);

	async function reload() {
		invitations = await api.listInvitations();
	}

	async function reloadMembers() {
		members = await api.listMembers(orgId!);
	}

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		try {
			const memberships = await auth.loadMemberships(true);
			const m = memberships.find(
				(row) => row.id === orgId && (row.role === 'leader' || row.role === 'participant')
			);
			if (m) {
				membership = m;
			} else if (auth.isAdmin) {
				// Admins have no membership row; fetch the org for its name and act as leader.
				const org = await api.getOrganization(orgId!);
				membership = { id: org.id, name: org.name, role: 'leader' };
			} else {
				await goto('/');
				return;
			}
			await reload();
			if (isManager) await reloadMembers();
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('invitations.errorFallback');
		} finally {
			loading = false;
		}
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		sendError = null;
		busy = true;
		try {
			await api.createInvitation(email, orgId, inviteRole);
			email = '';
			inviteRole = 'participant';
			await reload();
		} catch (e) {
			sendError = e instanceof ApiError ? e.message : t('invitations.sendErrorFallback');
		} finally {
			busy = false;
		}
	}

	// Flips an existing member between participant and scan-only staff. The
	// leader row has no control, so `role` here is always participant/staff.
	async function changeRole(member: OrgMember, role: OrgRole) {
		if (role === member.role) return;
		memberError = null;
		try {
			await api.setMemberRole(orgId!, member.user_id, role);
			await reloadMembers();
		} catch (e) {
			memberError = e instanceof ApiError ? e.message : t('orgMembers.changeErrorFallback');
			await reloadMembers();
		}
	}

	// Removes a non-leader member. Hidden on the caller's own row, so this never
	// removes the acting user; the backend rejects self- and leader-removal too.
	async function removeMember(member: OrgMember) {
		const ok = await confirmDialog({
			message: t('orgMembers.removeConfirm', { email: member.email }),
			confirmText: t('orgMembers.remove'),
			danger: true
		});
		if (!ok) return;
		memberError = null;
		try {
			await api.removeMember(orgId!, member.user_id);
			await reloadMembers();
		} catch (e) {
			memberError = e instanceof ApiError ? e.message : t('orgMembers.removeErrorFallback');
			await reloadMembers();
		}
	}
</script>

{#if membership}
	<h1>{t('orgInvitations.title', { org: membership.name })}</h1>
	<p class="muted">{t('orgInvitations.subtitle')}</p>

	<form onsubmit={send} class="card stack" style="margin: 1rem 0;">
		<label for="email">{t('common.email')}</label>
		<div class="row">
			<input
				id="email"
				type="email"
				bind:value={email}
				placeholder="amigo@exemplo.com"
				required
			/>
			<select bind:value={inviteRole} aria-label={t('orgMembers.roleLabel')}>
				<option value="participant">{t('profile.orgs.roleParticipant')}</option>
				<option value="staff">{t('profile.orgs.roleStaff')}</option>
			</select>
			<button type="submit" disabled={busy || !email}>
				{busy ? t('invitations.sending') : t('invitations.send')}
			</button>
		</div>
		<p class="muted small">{t('orgMembers.roleHint')}</p>
		{#if sendError}
			<div class="error">{sendError}</div>
		{/if}
	</form>

	{#if isManager}
		<h2>{t('orgMembers.title')}</h2>
		{#if memberError}
			<div class="error">{memberError}</div>
		{/if}
		{#if members.length === 0}
			<p class="muted">{t('common.loading')}</p>
		{:else}
			<div class="stack">
				{#each members as m (m.user_id)}
					<div class="line card">
						<div>
							<strong>{m.email}</strong>
						</div>
						{#if m.role === 'leader'}
							<span class="badge leader">{t('profile.orgs.roleLeader')}</span>
						{:else}
							<div class="controls">
								<select
									value={m.role}
									aria-label={t('orgMembers.roleLabel')}
									onchange={(e) => changeRole(m, e.currentTarget.value as OrgRole)}
								>
									<option value="participant">{t('profile.orgs.roleParticipant')}</option>
									<option value="staff">{t('profile.orgs.roleStaff')}</option>
								</select>
								{#if m.user_id !== auth.user?.id}
									<button type="button" class="danger" onclick={() => removeMember(m)}>
										{t('orgMembers.remove')}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if loading}
		<p class="muted">{t('common.loading')}</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if visible.length === 0}
		<p class="muted">{t('invitations.empty')}</p>
	{:else}
		<div class="stack">
			{#each visible as i (i.id)}
				<div class="line card">
					<div>
						<strong>{i.email}</strong>
						<div class="muted small">{formatDateTime(i.created_at)}</div>
					</div>
					<span class="badge {i.status === 'accepted' ? 'paid' : 'pending'}"
						>{tStatus(i.status)}</span
					>
				</div>
			{/each}
		</div>
	{/if}
{:else if loading}
	<p class="muted">{t('common.loading')}</p>
{/if}

<style>
	.line {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.small {
		font-size: 0.85rem;
	}
	.controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.row :global(input) {
		flex: 1;
	}
</style>
