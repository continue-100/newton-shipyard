import { json } from '@sveltejs/kit';
import { endpoint } from '#lib/server/http.js';

export const GET = endpoint((event) => json({ user: event.locals.user }));
