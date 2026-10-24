<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, tRole, tStatus } from '$lib/i18n';
    import { inviteFailureMessage } from '$lib/modules/invitations/invitation-messages';
    import { formatDateTime } from '$lib/utils/datetime';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const INVITABLE_ROLES = ['member', 'leader', 'staff'] as const;

    let busy = $state(false);

    function inviteMessage(
        failed: { action?: string; error?: string } | null | undefined
    ): string | null {
        if (failed?.action !== 'invite' || !failed.error) return null;
        return inviteFailureMessage(failed.error);
    }

    function memberMessage(
        failed: { action?: string; error?: string } | null | undefined
    ): string | null {
        if (!failed?.error || failed.action === 'invite') return null;
        return t(
            failed.action === 'remove' ? 'team.removeErrorFallback' : 'team.changeErrorFallback'
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

    // Hidden on the caller's own row and on admins, so this never removes the
    // acting user; the server refuses both too.
    async function confirmRemove(e: MouseEvent, email: string) {
        e.preventDefault();
        const button = e.currentTarget as HTMLButtonElement;
        const ok = await confirmDialog({
            message: t('team.removeConfirm', { email }),
            confirmText: t('team.remove'),
            danger: true
        });
        if (ok) button.form?.requestSubmit(button);
    }
</script>

<h1>{t('team.title', { org: data.organizationName })}</h1>
<p class="muted">{t('team.subtitle')}</p>

{#if data.loadFailed}
    <div class="error">{t('invitations.errorFallback')}</div>
{/if}

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
        <select name="role" aria-label={t('team.roleLabel')}>
            {#each INVITABLE_ROLES as role (role)}
                <option value={role}>{tRole(role)}</option>
            {/each}
        </select>
        <button type="submit" disabled={busy}>
            {busy ? t('invitations.sending') : t('invitations.send')}
        </button>
    </div>
    <p class="muted small">{t('team.roleHint')}</p>
    {#if sendError}
        <div class="error">{sendError}</div>
    {/if}
</form>

<h2>{t('team.members')}</h2>
{#if memberError}
    <div class="error">{memberError}</div>
{/if}
{#if data.members.length === 0}
    <p class="muted">{t('team.noMembers')}</p>
{:else}
    <div class="stack">
        {#each data.members as m (m.userId)}
            <form method="POST" action="?/setRole" class="line card" use:enhance={submitRow}>
                <input type="hidden" name="user_id" value={m.userId} />
                <div>
                    <strong>{m.email}</strong>
                    {#if m.name}
                        <div class="muted small">{m.name}</div>
                    {/if}
                </div>
                {#if m.userId === data.currentUserId || m.role === 'admin'}
                    <span class="badge" class:leader={m.role !== 'staff'}>{tRole(m.role)}</span>
                {:else}
                    <div class="controls">
                        <select
                            name="role"
                            value={m.role}
                            aria-label={t('team.roleLabel')}
                            onchange={saveOnChange}
                        >
                            {#each INVITABLE_ROLES as role (role)}
                                <option value={role}>{tRole(role)}</option>
                            {/each}
                        </select>
                        <button
                            type="submit"
                            class="danger"
                            formaction="?/remove"
                            onclick={(e) => confirmRemove(e, m.email)}
                        >
                            {t('team.remove')}
                        </button>
                    </div>
                {/if}
            </form>
        {/each}
    </div>
{/if}

<h2>{t('team.invitations')}</h2>
{#if data.invitations.length === 0}
    <p class="muted">{t('invitations.empty')}</p>
{:else}
    <div class="stack">
        {#each data.invitations as i (i.id)}
            <div class="line card">
                <div>
                    <strong>{i.email}</strong>
                    <div class="muted small">{tRole(i.role)} · {formatDateTime(i.createdAt)}</div>
                </div>
                <span class="badge {i.status === 'accepted' ? 'paid' : 'pending'}"
                    >{tStatus(i.status)}</span
                >
            </div>
        {/each}
    </div>
{/if}

<style>
    h2 {
        margin-top: 1.5rem;
    }
    .line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
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
    .badge.leader {
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
    }
</style>
