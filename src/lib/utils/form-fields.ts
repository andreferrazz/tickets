/**
 * One text field of a submitted form, or '' when it is absent or a file.
 *
 * @example
 * const email = text(await request.formData(), 'email').trim();
 */
export function text(form: FormData, field: string): string {
    const value = form.get(field);
    return typeof value === 'string' ? value : '';
}
