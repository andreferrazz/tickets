<script lang="ts">
    import { enhance } from '$app/forms';
    import { t, tStatus } from '$lib/i18n';
    import { auth } from '$lib/stores/auth.svelte';
    import type { OrgRole } from '$lib/types';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    function roleLabel(role: OrgRole): string {
        if (role === 'leader') return t('profile.orgs.roleLeader');
        if (role === 'staff') return t('profile.orgs.roleStaff');
        return t('profile.orgs.roleParticipant');
    }
</script>

<h1>{t('profile.title')}</h1>
{#if data.user}
    <div class="card stack" style="max-width: 480px;">
        <div>
            <div class="muted small">{t('profile.email')}</div>
            <strong>{data.user.email}</strong>
        </div>
        <div>
            <div class="muted small">{t('profile.role')}</div>
            <span class="badge published">{tStatus(data.user.role)}</span>
        </div>

        <div>
            <div class="muted small">{t('profile.orgs.title')}</div>
            {#if data.memberships.length === 0}
                <div class="muted small">{t('profile.orgs.empty')}</div>
            {:else}
                <ul class="orgs">
                    {#each data.memberships as m (m.id)}
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
