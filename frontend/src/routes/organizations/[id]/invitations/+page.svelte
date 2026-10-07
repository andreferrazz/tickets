<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import { api, ApiError } from '$lib/api';
    import { formatDateTime } from '$lib/utils/datetime';
    import { t, tStatus } from '$lib/i18n';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import type { OrgMemberDto } from '$lib/modules/organizations/types';
    import type { OrgRole } from '$lib/types';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const orgId = $derived(page.params.id);
    // Server-rendered: whoever reaches this component manages the organization;
    // the load function sends everyone else home.
    const membership = $derived(data.organization);
    // Managers (leader + participant) see the member list and may change roles and
    // remove members. The leader row is protected; staff manage nothing.
    const isManager = $derived(data.managerRole === 'leader' || data.managerRole === 'participant');

    let email = $state('');
    let inviteRole = $state<OrgRole>('participant');
    let sendError = $state<string | null>(null);
    let busy = $state(false);
    let memberError = $state<string | null>(null);

    // Writes still go through Phoenix until the organizations step of the
    // migration; the page is then re-read from the server.
    async function send(e: SubmitEvent) {
        e.preventDefault();
        sendError = null;
        busy = true;
        try {
            await api.createInvitation(email, orgId, inviteRole);
            email = '';
            inviteRole = 'participant';
            await invalidateAll();
        } catch (e) {
            sendError = e instanceof ApiError ? e.message : t('invitations.sendErrorFallback');
        } finally {
            busy = false;
        }
    }

    // Flips an existing member between participant and scan-only staff. The
    // leader row has no control, so `role` here is always participant/staff.
    async function changeRole(member: OrgMemberDto, role: OrgRole) {
        if (role === member.role) return;
        memberError = null;
        try {
            await api.setMemberRole(orgId!, member.userId, role);
        } catch (e) {
            memberError = e instanceof ApiError ? e.message : t('orgMembers.changeErrorFallback');
        } finally {
            await invalidateAll();
        }
    }

    // Removes a non-leader member. Hidden on the caller's own row, so this never
    // removes the acting user; the backend rejects self- and leader-removal too.
    async function removeMember(member: OrgMemberDto) {
        const ok = await confirmDialog({
            message: t('orgMembers.removeConfirm', { email: member.email }),
            confirmText: t('orgMembers.remove'),
            danger: true
        });
        if (!ok) return;
        memberError = null;
        try {
            await api.removeMember(orgId!, member.userId);
        } catch (e) {
            memberError = e instanceof ApiError ? e.message : t('orgMembers.removeErrorFallback');
        } finally {
            await invalidateAll();
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
        {#if data.members.length === 0}
            <p class="muted">{t('invitations.empty')}</p>
        {:else}
            <div class="stack">
                {#each data.members as m (m.userId)}
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
                                    onchange={(e) =>
                                        changeRole(m, e.currentTarget.value as OrgRole)}
                                >
                                    <option value="participant"
                                        >{t('profile.orgs.roleParticipant')}</option
                                    >
                                    <option value="staff">{t('profile.orgs.roleStaff')}</option>
                                </select>
                                {#if m.userId !== data.currentUserId}
                                    <button
                                        type="button"
                                        class="danger"
                                        onclick={() => removeMember(m)}
                                    >
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

    {#if data.loadFailed}
        <div class="error">{t('invitations.errorFallback')}</div>
    {:else if data.invitations.length === 0}
        <p class="muted">{t('invitations.empty')}</p>
    {:else}
        <div class="stack">
            {#each data.invitations as i (i.id)}
                <div class="line card">
                    <div>
                        <strong>{i.email}</strong>
                        <div class="muted small">{formatDateTime(i.createdAt)}</div>
                    </div>
                    <span class="badge {i.status === 'accepted' ? 'paid' : 'pending'}"
                        >{tStatus(i.status)}</span
                    >
                </div>
            {/each}
        </div>
    {/if}
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
