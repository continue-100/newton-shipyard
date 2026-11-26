import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { getAuth } from '#lib/server/runtime.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	const token = event.cookies.get('shipyard_session');
	if (token) {
		try {
			event.locals.user = getAuth().user(token);
		} catch {
			return json({ error: 'Authentication is not configured.' }, { status: 503 });
		}
		if (!event.locals.user) event.cookies.delete('shipyard_session', { path: '/' });
	}
	return resolve(event);
};
