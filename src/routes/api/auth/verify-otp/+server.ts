import { json } from '@sveltejs/kit';
import { body, endpoint } from '#lib/server/http.js';
import { ApiError, SESSION_SECONDS } from '#lib/server/auth.js';
import { getAuth } from '#lib/server/runtime.js';
export const POST = endpoint(async (event) => {
	const input = await body(event);
	const auth = getAuth();
	const session = auth.verify(input.email, input.code, event.getClientAddress());
	if (!session) throw new ApiError(400, 'Invalid or expired link. Request a new link if needed.');
	const previous = event.cookies.get('shipyard_session');
	if (previous) auth.logout(previous);
	event.cookies.set('shipyard_session', session.token, {
		path: '/',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: SESSION_SECONDS
	});
	return json({ user: session.user });
});
