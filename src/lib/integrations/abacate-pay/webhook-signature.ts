import { createHmac, timingSafeEqual } from 'node:crypto';

// Abacate Pay signs every webhook body with this one key, the same for every
// seller and published in their docs; it proves the body came through their
// signer, while the per-seller secret in the URL proves it is meant for us.
// Copied from `Backend.AbacatePay.public_key/0`.
const ABACATE_PUBLIC_KEY =
    't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

/**
 * The `x-webhook-signature` Abacate Pay sends for `rawBody`: HMAC-SHA256 with
 * their public key, base64. Must be computed over the bytes as received, never
 * over a re-serialised object.
 *
 * Imports nothing from the app on purpose: the e2e suite signs its own
 * webhooks with this same function.
 *
 * @example
 * signWebhookBody('{"event":"checkout.completed"}'); // 'q1Yk…='
 */
export function signWebhookBody(rawBody: string): string {
    return createHmac('sha256', ABACATE_PUBLIC_KEY).update(rawBody).digest('base64');
}

/**
 * Whether two secrets match, compared in constant time so the answer's timing
 * says nothing about how much of a guess was right. An empty `expected` never
 * matches: an unconfigured secret must not accept an empty one.
 *
 * @example
 * secretsMatch(signWebhookBody(rawBody), request.headers.get('x-webhook-signature') ?? '');
 */
export function secretsMatch(expected: string, received: string): boolean {
    const [a, b] = [Buffer.from(expected), Buffer.from(received)];
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
