<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { t } from '$lib/i18n';

    // The fallback for every route without an error page of its own. A 404 is
    // often "not yours to see": loads deliberately do not tell those apart.
    const message = $derived(
        page.status === 404 ? t('common.notFound') : t('common.errorFallback')
    );
</script>

<div class="error">{message}</div>

<p><a class="btn secondary" href={resolve('/')}>{t('nav.events')}</a></p>
