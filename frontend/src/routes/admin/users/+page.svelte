<script lang="ts">
    import { api, ApiError } from '$lib/api';
    import { t } from '$lib/i18n';
    import type { UserDto } from '$lib/modules/accounts/types';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let query = $state('');

    // Per-user UI state keyed by id: which row is generating a link, which just
    // copied (for transient feedback), and any copy error.
    let busyId = $state<string | null>(null);
    let copiedId = $state<string | null>(null);
    let copyError = $state<string | null>(null);

    const filtered = $derived(
        data.users.filter((u) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        })
    );

    // Impersonation still goes through Phoenix until the auth step of the migration.
    async function copyLoginLink(user: UserDto) {
        if (busyId) return;
        busyId = user.id;
        copyError = null;
        try {
            const { token } = await api.impersonateUser(user.id);
            const link = `${window.location.origin}/auth/impersonate?token=${token}`;
            await navigator.clipboard.writeText(link);
            copiedId = user.id;
            setTimeout(() => {
                if (copiedId === user.id) copiedId = null;
            }, 2000);
        } catch (e) {
            copyError = e instanceof ApiError ? e.message : t('adminUsers.copyErrorFallback');
        } finally {
            busyId = null;
        }
    }
</script>

<h1>{t('adminUsers.title')}</h1>
<p class="muted">{t('adminUsers.subtitle')}</p>

<input placeholder={t('adminUsers.searchPlaceholder')} bind:value={query} style="margin: 1rem 0;" />

{#if copyError}
    <div class="error">{copyError}</div>
{/if}

{#if data.loadFailed}
    <div class="error">{t('adminUsers.errorFallback')}</div>
{:else if filtered.length === 0}
    <p class="muted">{t('adminUsers.empty')}</p>
{:else}
    <div class="stack">
        {#each filtered as u (u.id)}
            <div class="line card">
                <div>
                    <strong>{u.name ?? t('adminUsers.noName')}</strong>
                    <div class="muted small">{u.email}</div>
                </div>
                <button
                    class="secondary small"
                    disabled={busyId === u.id}
                    onclick={() => copyLoginLink(u)}
                >
                    {#if copiedId === u.id}
                        {t('adminUsers.copied')}
                    {:else if busyId === u.id}
                        {t('adminUsers.copying')}
                    {:else}
                        {t('adminUsers.copyLink')}
                    {/if}
                </button>
            </div>
        {/each}
    </div>
{/if}

<style>
    .line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }
    .small {
        font-size: 0.85rem;
    }
</style>
