/**
 * Outgoing transactional mail as the app sees it. `smtp-mailer.ts` delivers it,
 * `fake-mailer.ts` keeps it in an outbox for e2e runs.
 */
export interface InlineImage {
    /** Referenced from the HTML body as `<img src="cid:...">`. */
    cid: string;
    filename: string;
    contentType: 'image/png';
    content: Uint8Array;
}

export interface OutgoingEmail {
    to: string;
    subject: string;
    /** Plain-text body, always present so a client that drops HTML still shows something. */
    text: string;
    html?: string;
    inlineImages?: InlineImage[];
}

export interface Mailer {
    send(email: OutgoingEmail): Promise<void>;
}
