<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, tStatus } from '$lib/i18n';
    import { inviteFailureMessage } from '$lib/modules/invitations/invitation-messages';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let busy = $state(false);

    const sendError = $derived(form?.error ? inviteFailureMessage(form.error) : null);
</script>

<h1>{t('invitations.title')}</h1>
<p class="muted">{t('invitations.subtitle')}</p>

<form
    method="POST"
    action="?/invite"
    class="card stack"
    style="margin: 1rem 0;"
    use:enhance={() => {
        busy = true;
        return async ({ update }) => {
            busy = false;
            await update();
        };
    }}
>
    <label for="email">{t('common.email')}</label>
    <div class="row">
        <input id="email" name="email" type="email" placeholder="amigo@exemplo.com" required />
        <button type="submit" disabled={busy}>
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
