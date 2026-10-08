import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
import type { SubmitFunction } from '@sveltejs/kit';

// Every row on the edit page is its own form. Saving on change keeps the old
// feel of the page: the input submits the row it sits in, and the page re-reads
// itself.

/** `use:enhance` for a row that already exists: keep what was typed after saving. */
export const submitRow: SubmitFunction = () => {
    return async ({ update }) => {
        await update({ reset: false });
    };
};

/** `use:enhance` for an "add" row: clear it once the new row is created. */
export const submitNewRow: SubmitFunction = () => {
    return async ({ update }) => {
        await update();
    };
};

/**
 * Submits the form the changed input sits in.
 *
 * @example
 * <input name="name" value={row.name} onchange={saveOnChange} />
 */
export function saveOnChange(e: Event): void {
    (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).form?.requestSubmit();
}

/**
 * Asks before a destructive submit. The button is a submit button so
 * `requestSubmit(button)` uses its own `formaction`; the click itself is
 * cancelled until the dialog agrees.
 *
 * @example
 * <button formaction="?/deleteBatch" onclick={(e) => confirmThenSubmit(e, message, label)}>
 */
export async function confirmThenSubmit(
    e: MouseEvent,
    message: string,
    confirmText: string
): Promise<void> {
    e.preventDefault();
    const button = e.currentTarget as HTMLButtonElement;
    const ok = await confirmDialog({ message, confirmText, danger: true });
    if (ok) button.form?.requestSubmit(button);
}
