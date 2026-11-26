import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ShipyardDatabase } from './db';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}
export type User = { id: string; email: string };
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function campusEmail(value: unknown): string {
	if (typeof value !== 'string') throw new ApiError(400, 'Enter your campus email.');
	const email = value.trim().toLowerCase();
	if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@svyasa-sas\.edu\.in$/.test(email))
		throw new ApiError(400, 'Use your @svyasa-sas.edu.in email address.');
	return email;
}

export function rateLimit(
	db: ShipyardDatabase,
	key: string,
	limit: number,
	windowMs: number,
	now = Date.now()
) {
	const row = db
		.query<{ count: number }, [string, number, number]>(
			`
		INSERT INTO rate_limits(key, count, reset_at) VALUES (?, 1, ?)
		ON CONFLICT(key) DO UPDATE SET
		count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
		reset_at = CASE WHEN reset_at <= ?3 THEN excluded.reset_at ELSE reset_at END
		RETURNING count
	`
		)
		.get(key, now + windowMs, now)!;
	if (row.count > limit) throw new ApiError(429, 'Too many requests. Please try again later.');
}

export function createAuth(
	db: ShipyardDatabase,
	secret: string,
	send: (email: string, code: string, origin: string) => Promise<void>
) {
	if (secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters.');
	const digest = (email: string, code: string) =>
		createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
	return {
		async request(value: unknown, ip: string, now = Date.now(), origin = 'http://localhost:5173') {
			const email = campusEmail(value);
			rateLimit(db, `send-ip:${hash(ip)}`, 20, 3600_000, now);
			rateLimit(db, `send-email:${email}`, 5, 3600_000, now);
			// Cap total traffic from the shared sender account.
			rateLimit(db, 'smtp-daily', 400, 86400_000, now);
			const previous = db
				.query<{ sent_at: number }, [string]>('SELECT sent_at FROM otp WHERE email = ?')
				.get(email);
			if (previous && now - previous.sent_at < 60_000)
				throw new ApiError(429, 'Wait one minute before requesting another link.');
			const code = randomBytes(32).toString('hex');
			const codeDigest = digest(email, code);
			db.query(
				`INSERT INTO otp(email, digest, expires_at, sent_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET digest=excluded.digest, expires_at=excluded.expires_at, sent_at=excluded.sent_at, attempts=0`
			).run(email, codeDigest, now + 600_000, now);
			try {
				await send(email, code, origin);
			} catch {
				db.query('DELETE FROM otp WHERE email = ? AND digest = ?').run(email, codeDigest);
				throw new ApiError(503, 'Email delivery failed. Please try again later.');
			}
		},
		verify(value: unknown, code: unknown, ip: string, now = Date.now()) {
			const email = campusEmail(value);
			rateLimit(db, `verify-ip:${hash(ip)}`, 50, 900_000, now);
			if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code))
				throw new ApiError(400, 'Invalid sign-in link.');
			return db
				.transaction(() => {
					const row = db
						.query<{ digest: string; expires_at: number; attempts: number }, [string]>(
							'SELECT * FROM otp WHERE email = ?'
						)
						.get(email);
					if (!row || row.expires_at <= now || row.attempts >= 5) return null;
					db.query('UPDATE otp SET attempts = attempts + 1 WHERE email = ?').run(email);
					if (
						!timingSafeEqual(
							Buffer.from(row.digest, 'hex'),
							Buffer.from(digest(email, code), 'hex')
						)
					)
						return null;
					db.query('DELETE FROM otp WHERE email = ?').run(email);
					db.query(
						'INSERT INTO users(id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING'
					).run(crypto.randomUUID(), email, now);
					const user = db
						.query<User, [string]>('SELECT id, email FROM users WHERE email = ?')
						.get(email)!;
					const token = randomBytes(32).toString('hex');
					db.query('INSERT INTO sessions(digest, user_id, expires_at) VALUES (?, ?, ?)').run(
						hash(token),
						user.id,
						now + SESSION_SECONDS * 1000
					);
					return { user, token };
				})
				.immediate();
		},
		user(token: string | undefined, now = Date.now()): User | null {
			if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
			return db
				.query<User, [string, number]>(
					`SELECT users.id, users.email FROM sessions
				JOIN users ON users.id = sessions.user_id WHERE digest = ? AND expires_at > ?`
				)
				.get(hash(token), now);
		},
		logout(token: string) {
			db.query('DELETE FROM sessions WHERE digest = ?').run(hash(token));
		}
	};
}
