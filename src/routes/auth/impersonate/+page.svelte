<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { t } from '$lib/i18n';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let busy = $state(false);
    // A link that was already used answers the action with an error even though
    // the page loaded fine a moment ago.
    const dead = $derived(!data.targetEmail || !!form?.error);
</script>

<div class="impersonate-wrap">
    <div class="card stack">
        {#if dead}
            <h1>{t('impersonate.errorTitle')}</h1>
            <p class="error">{t('impersonate.errorFallback')}</p>
            <a href={resolve('/auth/login')}>{t('impersonate.goLogin')}</a>
        {:else}
            <h1>{t('impersonate.confirmTitle')}</h1>
            <p class="muted">{t('impersonate.hint')}</p>
            <form
                method="POST"
                action="?/confirm"
                use:enhance={() => {
                    busy = true;
                    return async ({ result, update }) => {
                        busy = false;
                        const signedIn =
                            result.type === 'success'
                                ? (result.data as { token: string; user: UserDto } | undefined)
                                : undefined;
                        if (!signedIn) return update();
                        // The cookie is set; this is the store's copy, which the
                        // navigation renders from.
                        await auth.set(signedIn.token, signedIn.user);
                        await goto(resolve('/'));
                    };
                }}
            >
                <input type="hidden" name="token" value={data.token} />
                <button type="submit" disabled={busy}>
                    {busy
                        ? t('impersonate.loading')
                        : t('impersonate.confirm', { email: data.targetEmail ?? '' })}
                </button>
            </form>
        {/if}
    </div>
</div>

<style>
    .impersonate-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem 0;
    }
    .card {
        width: 100%;
        max-width: 420px;
    }
</style>
