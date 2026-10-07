/**
 * A response's HTML without its scripts. SvelteKit serialises every load's
 * data into a script tag, so a title "in the HTML" may only be in that
 * payload; asserting on this proves the markup itself was rendered on the
 * server. Leak checks (`not.toContain`) keep using the raw text, where the
 * payload counts too.
 */
export function withoutScripts(html: string): string {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}
