<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, tStatus } from '$lib/i18n';
    import { formatDateTime } from '$lib/utils/datetime';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Server-rendered: whoever reaches this component manages the organization;
    // the load function sends everyone else home.
    const membership = $derived(data.organization);
    // Managers (leader + participant) see the member list and may change roles and
    // remove members. The leader row is protected; staff manage nothing.
    const isManager = $derived(data.managerRole === 'leader' || data.managerRole === 'participant');

    let busy = $state(false);

    function inviteMessage(
        failed: { action?: string; error?: string } | null | undefined
    ): string | null {
        if (failed?.action !== 'invite' || !failed.error) return null;
        if (failed.error === 'already_invited') return t('invitations.alreadyInvited');
        if (failed.error === 'already_member') return t('invitations.alreadyMember');
        return t('invitations.sendErrorFallback');
    }

    function memberMessage(
        failed: { action?: string; error?: string } | null | undefined
    ): string | null {
        if (!failed?.error || failed.action === 'invite') return null;
        return t(
            failed.action === 'removeMember'
                ? 'orgMembers.removeErrorFallback'
                : 'orgMembers.changeErrorFallback'
        );
    }

    const sendError = $derived(inviteMessage(form));
    const memberError = $derived(memberMessage(form));

    const sendInvite: SubmitFunction = () => {
        busy = true;
        return async ({ update }) => {
            busy = false;
            await update();
        };
    };

    const submitRow: SubmitFunction = () => {
        return async ({ update }) => {
            await update({ reset: false });
        };
    };

    function saveOnChange(e: Event) {
        (e.currentTarget as HTMLSelectElement).form?.requestSubmit();
    }

    // Removes a non-leader member. Hidden on the caller's own row, so this never
    // removes the acting user; the server rejects self- and leader-removal too.
    async function confirmRemove(e: MouseEvent, email: string) {
        e.preventDefault();
        const button = e.currentTarget as HTMLButtonElement;
        const ok = await confirmDialog({
            message: t('orgMembers.removeConfirm', { email }),
            confirmText: t('orgMembers.remove'),
            danger: true
        });
        if (ok) button.form?.requestSubmit(button);
    }
</script>

{#if membership}
    <h1>{t('orgInvitations.title', { org: membership.name })}</h1>
    <p class="muted">{t('orgInvitations.subtitle')}</p>

    <form
        method="POST"
        action="?/invite"
        class="card stack"
        style="margin: 1rem 0;"
        use:enhance={sendInvite}
    >
        <label for="email">{t('common.email')}</label>
        <div class="row">
            <input id="email" name="email" type="email" placeholder="amigo@exemplo.com" required />
            <select name="role" aria-label={t('orgMembers.roleLabel')}>
                <option value="participant">{t('profile.orgs.roleParticipant')}</option>
                <option value="staff">{t('profile.orgs.roleStaff')}</option>
            </select>
            <button type="submit" disabled={busy}>
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
                    <form
                        method="POST"
                        action="?/setRole"
                        class="line card"
                        use:enhance={submitRow}
                    >
                        <input type="hidden" name="user_id" value={m.userId} />
                        <div>
                            <strong>{m.email}</strong>
                        </div>
                        {#if m.role === 'leader'}
                            <span class="badge leader">{t('profile.orgs.roleLeader')}</span>
                        {:else}
                            <div class="controls">
                                <select
                                    name="role"
                                    value={m.role}
                                    aria-label={t('orgMembers.roleLabel')}
                                    onchange={saveOnChange}
                                >
                                    <option value="participant"
                                        >{t('profile.orgs.roleParticipant')}</option
                                    >
                                    <option value="staff">{t('profile.orgs.roleStaff')}</option>
                                </select>
                                {#if m.userId !== data.currentUserId}
                                    <button
                                        type="submit"
                                        class="danger"
                                        formaction="?/removeMember"
                                        onclick={(e) => confirmRemove(e, m.email)}
                                    >
                                        {t('orgMembers.remove')}
                                    </button>
                                {/if}
                            </div>
                        {/if}
                    </form>
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
