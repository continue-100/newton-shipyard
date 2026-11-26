import { json } from '@sveltejs/kit';
import { body, endpoint } from '#lib/server/http.js';
import { getAuth } from '#lib/server/runtime.js';

export const POST = endpoint(async (event) => {
	await body(event);
	const token = event.cookies.get('shipyard_session');
	if (token) getAuth().logout(token);
	event.cookies.delete('shipyard_session', { path: '/' });
	return json({ message: 'Signed out.' });
});
