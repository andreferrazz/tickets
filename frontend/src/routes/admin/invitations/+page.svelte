<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { api, ApiError } from '$lib/api';
    import { formatDateTime } from '$lib/utils/datetime';
    import { t, tStatus } from '$lib/i18n';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let email = $state('');
    let sendError = $state<string | null>(null);
    let busy = $state(false);

    // Sending still goes through Phoenix until the organizations step of the
    // migration; the list is then re-read from the server.
    async function send(e: SubmitEvent) {
        e.preventDefault();
        sendError = null;
        busy = true;
        try {
            await api.createInvitation(email);
            email = '';
            await invalidateAll();
        } catch (e) {
            sendError = e instanceof ApiError ? e.message : t('invitations.sendErrorFallback');
        } finally {
            busy = false;
        }
    }
</script>

<h1>{t('invitations.title')}</h1>
<p class="muted">{t('invitations.subtitle')}</p>

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
        <button type="submit" disabled={busy || !email}>
            {busy ? t('invitations.sending') : t('invitations.send')}
        </button>
    </div>
    {#if sendError}
        <div class="error">{sendError}</div>
    {/if}
</form>

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

<style>
    .line {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .small {
        font-size: 0.85rem;
    }
    .row :global(input) {
        flex: 1;
    }
</style>
