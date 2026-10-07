// Any real origin would do: it only gives a relative target something to
// resolve against, so a target that escapes it can be told apart.
const PLACEHOLDER_ORIGIN = 'http://same-origin.invalid';
// Browsers strip tabs and newlines before parsing a URL, which turns
// "/\t/evil.com" into "//evil.com"; nothing legitimate carries them.
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

/**
 * A `next` redirect target that is safe to follow: a path on this site, or
 * null. The target is parsed the way a browser would parse it rather than
 * matched against known-bad prefixes, so a new way of spelling "another host"
 * fails closed.
 *
 * @example
 * safeNext('/orders?x=1');   // '/orders?x=1'
 * safeNext('//evil.com');    // null
 * safeNext('/\t/evil.com');  // null
 */
export function safeNext(raw: string | null | undefined): string | null {
    if (!raw || !raw.startsWith('/') || CONTROL_OR_SPACE.test(raw)) return null;
    let parsed: URL;
    try {
        parsed = new URL(raw, PLACEHOLDER_ORIGIN);
    } catch {
        return null;
    }
    if (parsed.origin !== PLACEHOLDER_ORIGIN) return null;
    return parsed.pathname + parsed.search + parsed.hash;
}
