<script lang="ts">
    import { resolve } from '$app/paths';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import { auth } from '$lib/stores/auth.svelte';
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const error = $derived(
        data.failure === 'expired'
            ? t('invite.errorExpired')
            : data.failure === 'invalid_token'
              ? t('invite.errorInvalid')
              : data.failure === 'already_accepted'
                ? t('invite.errorAlreadyAccepted')
                : data.failure
                  ? t('invite.errorFallback')
                  : null
    );

    // Admin-invited leaders land on the rename form: their organization was
    // auto-named and they should set it before anything else. The profile
    // step comes first when theirs is incomplete, carrying that target along.
    onMount(async () => {
        if (!data.accepted) return;
        const { token, user, organization } = data.accepted;
        await auth.set(token, user);
        const target =
            organization.role === 'leader'
                ? resolve('/onboarding/organization/[id]', { id: organization.id })
                : resolve('/');
        await goto(
            user.profileComplete
                ? target
                : `${resolve('/auth/profile')}?next=${encodeURIComponent(target)}`
        );
    });
</script>

<div class="invite-wrap">
    <div class="card stack">
        {#if error}
            <h1>{t('invite.errorTitle')}</h1>
            <p class="error">{error}</p>
            <a href={resolve('/auth/login')}>{t('invite.goLogin')}</a>
        {:else}
            <p>{t('invite.accepting')}</p>
        {/if}
    </div>
</div>

<style>
    .invite-wrap {
        max-width: 420px;
        margin: 3rem auto;
    }
</style>
