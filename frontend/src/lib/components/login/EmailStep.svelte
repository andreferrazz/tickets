<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import { loginModalStore } from '$lib/stores/loginModal.svelte';
    import { loginFailureMessage } from '$lib/modules/accounts/auth-messages';
    import { failureCode, type LoginActionResult } from './failure-text';

    // Posts to the login page's own action and intercepts the result to stay in
    // the modal, so there is one login flow on the server and this is only
    // another front for it.
    // Prefilled from the store so "change email" from the code step brings the
    // typed address back instead of a blank field (the store is cleared on open).
    let email = $state(loginModalStore.email);
    let error = $state<string | null>(null);
    let busy = $state(false);

    const onRequest = () => {
        busy = true;
        error = null;
        return async ({ result }: { result: LoginActionResult }) => {
            busy = false;
            // The page action redirects to the verify page; here that means "code sent".
            if (result.type === 'redirect') {
                loginModalStore.toCode(email);
                return;
            }
            error = loginFailureMessage(failureCode(result.data));
        };
    };
</script>

<h2 id="login-modal-title">{t('auth.login.title')}</h2>
<p class="muted">{t('auth.login.subtitle')}</p>
<form method="POST" action="/auth/login?/request" class="stack" use:enhance={onRequest}>
    <label for="lm-email">{t('common.email')}</label>
    <input
        id="lm-email"
        name="email"
        type="email"
        bind:value={email}
        required
        placeholder="voce@exemplo.com"
        autocomplete="email"
    />
    {#if error}
        <div class="error">{error}</div>
    {/if}
    <button type="submit" disabled={busy || !email}>
        {busy ? t('auth.login.sending') : t('auth.login.sendCode')}
    </button>
</form>
