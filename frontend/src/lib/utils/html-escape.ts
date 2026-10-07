const ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * `value` made safe to place in HTML text or a quoted attribute. Event titles
 * and item names are typed by creators and end up in email bodies.
 *
 * @example
 * escapeHtml('Rock & <Roll>'); // 'Rock &amp; &lt;Roll&gt;'
 */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ENTITIES[character]);
}
