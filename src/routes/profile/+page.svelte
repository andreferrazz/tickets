<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import { t, tRole } from '$lib/i18n';
    import { auth } from '$lib/stores/auth.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<h1>{t('profile.title')}</h1>
{#if data.user}
    <div class="card stack" style="max-width: 480px;">
        <div>
            <div class="muted small">{t('profile.email')}</div>
            <strong>{data.user.email}</strong>
        </div>
        <div>
            <div class="muted small">{t('profile.role', { org: data.organizationName })}</div>
            <span class="badge published">{tRole(data.user.role)}</span>
            {#if data.canLeadTeam}
                <a class="manage" href={resolve('/team')}>{t('profile.manageTeam')}</a>
            {/if}
        </div>

        <!-- The action revokes the session and clears the cookie; the browser's copy goes here. -->
        <form
            method="POST"
            action="?/logout"
            use:enhance={() => {
                return async ({ update }) => {
                    await auth.clear();
                    await update();
                };
            }}
        >
            <button class="danger" type="submit">{t('profile.logout')}</button>
        </form>
    </div>
{/if}

<style>
    .small {
        font-size: 0.8rem;
    }
    .manage {
        font-size: 0.85rem;
        margin-left: 0.6rem;
    }
</style>
