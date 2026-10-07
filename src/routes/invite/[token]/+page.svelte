<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { t } from '$lib/i18n';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import type { OrgRole } from '$lib/types';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Accepted = {
        token: string;
        user: UserDto;
        organization: { id: string; name: string; role: OrgRole };
    };

    let busy = $state(false);

    function failureMessage(failure: string | null | undefined): string | null {
        if (!failure) return null;
        if (failure === 'expired') return t('invite.errorExpired');
        if (failure === 'invalid_token') return t('invite.errorInvalid');
        if (failure === 'already_accepted') return t('invite.errorAlreadyAccepted');
        return t('invite.errorFallback');
    }

    const error = $derived(failureMessage(form?.failure ?? data.failure));

    // Admin-invited leaders land on the rename form: their organization was
    // auto-named and they should set it before anything else. The profile
    // step comes first when theirs is incomplete, carrying that target along.
    async function enter({ token, user, organization }: Accepted) {
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
    }
</script>

<div class="invite-wrap">
    <div class="card stack">
        {#if error || !data.invitation}
            <h1>{t('invite.errorTitle')}</h1>
            <p class="error">{error ?? t('invite.errorFallback')}</p>
            <a href={resolve('/auth/login')}>{t('invite.goLogin')}</a>
        {:else}
            <h1>{t('invite.title', { org: data.invitation.organizationName })}</h1>
            <p class="muted">{t('invite.hint', { email: data.invitation.email })}</p>
            <form
                method="POST"
                action="?/accept"
                use:enhance={() => {
                    busy = true;
                    return async ({ result, update }) => {
                        busy = false;
                        const accepted =
                            result.type === 'success'
                                ? (result.data as { accepted?: Accepted } | undefined)?.accepted
                                : undefined;
                        if (!accepted) return update();
                        await enter(accepted);
                    };
                }}
            >
                <button type="submit" disabled={busy}>
                    {busy ? t('invite.accepting') : t('invite.accept')}
                </button>
            </form>
        {/if}
    </div>
</div>

<style>
    .invite-wrap {
        max-width: 420px;
        margin: 3rem auto;
    }
</style>
