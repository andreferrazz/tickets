import type { User } from '$lib/types';
import { getState } from './store';

export function userFromRequest(req: Request): User | null {
	const auth = req.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	const token = auth.slice('Bearer '.length);
	const s = getState();
	const userId = s.sessions.get(token);
	if (!userId) return null;
	return s.users.get(userId) ?? null;
}

export function requireUser(req: Request): User {
	const user = userFromRequest(req);
	if (!user) throw new MockError(401, 'unauthorized');
	return user;
}

export function requireCreator(req: Request): User {
	const user = requireUser(req);
	if (user.role !== 'creator' && user.role !== 'admin') {
		throw new MockError(403, 'forbidden: creator role required');
	}
	return user;
}

export class MockError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}
