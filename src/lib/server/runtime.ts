import { openDatabase } from './db';
import { ApiError, createAuth } from './auth';
import { createOtpSender } from './smtp';

let database: ReturnType<typeof openDatabase> | undefined;
export const getDatabase = () =>
	(database ??= openDatabase(process.env.DATABASE_PATH || './data/shipyard.sqlite'));
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
	if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
		throw new ApiError(503, 'Set AUTH_SECRET to at least 32 random characters.');
	return (auth ??= createAuth(
		getDatabase(),
		process.env.AUTH_SECRET,
		createOtpSender({ SMTP_PASSWORD: process.env.SMTP_PASSWORD })
	));
}
