import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { ApiError, type User } from './auth';

export function endpoint(handler: RequestHandler): RequestHandler {
	return async (event) => {
		try {
			const response = await handler(event);
			response.headers.set('Cache-Control', 'no-store');
			return response;
		} catch (error) {
			if (error instanceof ApiError)
				return json(
					{ error: error.message },
					{ status: error.status, headers: { 'Cache-Control': 'no-store' } }
				);
			console.error(
				'Shipyard API failure',
				error instanceof Error ? error.message : 'Unknown error'
			);
			return json({ error: 'An unexpected server error occurred.' }, { status: 500 });
		}
	};
}

export async function body(event: RequestEvent): Promise<Record<string, unknown>> {
	if (event.request.headers.get('origin') !== event.url.origin)
		throw new ApiError(403, 'A same-origin request is required.');
	if (event.request.headers.get('content-type')?.split(';')[0] !== 'application/json')
		throw new ApiError(415, 'Send application/json.');
	const reader = event.request.body?.getReader();
	if (!reader) throw new ApiError(400, 'A JSON body is required.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 4096) {
			await reader.cancel();
			throw new ApiError(413, 'Request body is too large.');
		}
		chunks.push(value);
	}
	try {
		const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
		return data as Record<string, unknown>;
	} catch {
		throw new ApiError(400, 'Send a valid JSON object.');
	}
}

export function requireUser(event: RequestEvent): User {
	if (!event.locals.user) throw new ApiError(401, 'Sign in with your campus email first.');
	return event.locals.user;
}
