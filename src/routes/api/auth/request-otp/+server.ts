import { json } from '@sveltejs/kit';
import { body, endpoint } from '#lib/server/http.js';
import { getAuth } from '#lib/server/runtime.js';
export const POST = endpoint(async (event) => {
	const input = await body(event);
	await getAuth().request(input.email, event.getClientAddress(), Date.now(), event.url.origin);
	return json({
		message: 'Check your campus email for a sign-in link. It expires in 10 minutes.'
	});
});
