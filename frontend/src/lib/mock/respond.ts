import { json } from '@sveltejs/kit';
import { MockError } from './auth';

export function ok<T>(data: T, status = 200): Response {
	return json(data, { status });
}

export function err(status: number, message: string): Response {
	return json({ error: message }, { status });
}

export async function safe(fn: () => Promise<Response> | Response): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof MockError) return err(e.status, e.message);
		const msg = e instanceof Error ? e.message : 'internal error';
		return err(500, msg);
	}
}
