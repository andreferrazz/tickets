<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import type { ActionData, PageData } from './$types';

    /** What the verify action returns on success; `ActionData` is a union, so narrow by hand. */
    type Verified = { token: string; user: UserDto; next: string };

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let code = $state('');
    let busy = $state(false);

    // Where a verified visitor goes: the profile step first when theirs is not
    // complete, carrying `next` along so it is honoured afterwards.
    function destination(profileComplete: boolean, next: string): string {
        if (profileComplete) return next;
        return `/auth/profile?next=${encodeURIComponent(next)}`;
    }
</script>

<div class="auth-wrap">
    <div class="card stack">
        <h1>{t('auth.verify.title')}</h1>
        <p class="muted">{t('auth.verify.sentTo')} <strong>{data.email}</strong></p>
        {#if form?.user && form.token}
            <!-- Reached without JavaScript: the cookie is set, so just continue. -->
            <a href={destination(form.user.profileComplete, form.next)} class="btn">
                {t('auth.verify.verify')}
            </a>
        {/if}
        <form
            method="POST"
            action="?/verify"
            class="stack"
            use:enhance={() => {
                busy = true;
                return async ({ result, update }) => {
                    busy = false;
                    const verified =
                        result.type === 'success'
                            ? (result.data as Verified | undefined)
                            : undefined;
                    if (verified?.user && verified.token) {
                        // The browser keeps a copy of the token for the endpoints
                        // Phoenix still serves; the cookie already carries the session.
                        await auth.set(verified.token, verified.user);
                        await goto(destination(verified.user.profileComplete, verified.next));
                        return;
                    }
                    await update();
                };
            }}
        >
            <input type="hidden" name="email" value={data.email} />
            <input type="hidden" name="next" value={data.next ?? ''} />
            <label for="code">{t('auth.verify.label')}</label>
            <input
                id="code"
                name="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                bind:value={code}
                required
                placeholder="123456"
                autocomplete="one-time-code"
            />
            {#if form?.error}
                <div class="error">{form.error}</div>
            {/if}
            <button type="submit" disabled={busy || code.length !== 6}>
                {busy ? t('auth.verify.verifying') : t('auth.verify.verify')}
            </button>
            <a href="/auth/login" class="muted">{t('auth.verify.changeEmail')}</a>
        </form>
    </div>
</div>

<style>
    .auth-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem 0;
    }
    .card {
        width: 100%;
        max-width: 420px;
    }
</style>
