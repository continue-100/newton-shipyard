import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path, { create: true, strict: true });
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA foreign_keys = ON;
		PRAGMA busy_timeout = 5000;
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS sessions (
			digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS rate_limits (
			key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
		);
  CREATE TABLE IF NOT EXISTS otp (
   email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires_at INTEGER NOT NULL,
   attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL
  );
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY, repo_url TEXT NOT NULL UNIQUE,
			owner_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL
			CHECK(status IN ('active', 'maintenance', 'seeking-maintainer')),
			metadata TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		);
	`);
	// Remove OAuth state and identity links while preserving users and projects.
	db.transaction(() => {
		const version = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!
			.user_version;
		if (version < 2) {
			db.exec(
				'DELETE FROM sessions; DELETE FROM otp; DROP TABLE IF EXISTS oauth_flows; DROP INDEX IF EXISTS users_google_sub;'
			);
			const columns = db.query<{ name: string }, []>('PRAGMA table_info(users)').all();
			if (columns.some((column) => column.name === 'google_sub'))
				db.exec('ALTER TABLE users DROP COLUMN google_sub');
			db.exec('PRAGMA user_version = 2');
		}
	}).immediate();
	return db;
}

export type ShipyardDatabase = ReturnType<typeof openDatabase>;
