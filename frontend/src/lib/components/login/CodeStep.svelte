<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import { loginModalStore } from '$lib/stores/loginModal.svelte';
    import { verifyFailureMessage } from '$lib/modules/accounts/auth-messages';
    import { failureCode, type LoginActionResult } from './failure-text';

    type VerifyPayload = { token?: string; user?: UserDto } | undefined;

    let code = $state('');
    let error = $state<string | null>(null);
    let busy = $state(false);

    const onVerify = () => {
        busy = true;
        error = null;
        return async ({ result }: { result: LoginActionResult }) => {
            busy = false;
            const payload = result.data as VerifyPayload;
            if (result.type === 'success' && payload?.token && payload.user) {
                await auth.set(payload.token, payload.user);
                if (payload.user.profileComplete) loginModalStore.finish();
                else loginModalStore.toProfile();
                return;
            }
            error = verifyFailureMessage(failureCode(result.data));
        };
    };

    function backToEmail() {
        loginModalStore.step = 'email';
    }
</script>

<h2 id="login-modal-title">{t('auth.verify.title')}</h2>
<p class="muted">
    {t('auth.verify.sentTo')} <strong>{loginModalStore.email}</strong>
</p>
<form method="POST" action="/auth/verify?/verify" class="stack" use:enhance={onVerify}>
    <input type="hidden" name="email" value={loginModalStore.email} />
    <label for="lm-code">{t('auth.verify.label')}</label>
    <input
        id="lm-code"
        name="code"
        type="text"
        inputmode="numeric"
        maxlength="6"
        bind:value={code}
        required
        placeholder="123456"
        autocomplete="one-time-code"
    />
    {#if error}
        <div class="error">{error}</div>
    {/if}
    <button type="submit" disabled={busy || code.length !== 6}>
        {busy ? t('auth.verify.verifying') : t('auth.verify.verify')}
    </button>
    <button type="button" class="link" onclick={backToEmail}>
        {t('auth.verify.changeEmail')}
    </button>
</form>
