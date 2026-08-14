<script lang="ts">
    import { page } from '$app/state';
    import { t } from '$lib/i18n';

    // A 404 here means "no such event, or not yours to see" — the server load
    // deliberately cannot tell those apart.
    const message = $derived(page.status === 404 ? t('event.notFound') : t('event.errorFallback'));
</script>

<div class="error">{message}</div>

<p><a class="btn secondary" href="/">{t('nav.events')}</a></p>
