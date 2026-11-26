import { rejects } from 'node:assert/strict';
import { afterEach, expect, test } from 'bun:test';
import nodemailer from 'nodemailer';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOtpSender, SMTP_SENDER } from './smtp';
import { openDatabase } from './db';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
test('requires a sender app password before connecting', async () => {
	await rejects(
		createOtpSender({})('student@svyasa-sas.edu.in', '123456', 'https://shipyard.example'),
		/SMTP_PASSWORD/
	);
});
test('builds the OTP message from the fixed Gmail sender', async () => {
	let config: unknown;
	const messages: { from: { address: string }; to: string; text: string }[] = [];
	const factory = ((options: unknown) => {
		config = options;
		return {
			sendMail: (message: { from: { address: string }; to: string; text: string }) => {
				messages.push(message);
				return Promise.resolve({ accepted: [message.to], rejected: [] });
			}
		};
	}) as unknown as typeof nodemailer.createTransport;
	const send = createOtpSender({ SMTP_PASSWORD: 'abcd efgh ijkl mnop' }, factory);
	await send('student@svyasa-sas.edu.in', '123456', 'https://shipyard.example');
	expect(config).toMatchObject({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: { user: SMTP_SENDER, pass: 'abcdefghijklmnop' }
	});
	expect(messages[0].from.address).toBe('2392608478@svyasa-sas.edu.in');
	expect(messages[0].to).toBe('student@svyasa-sas.edu.in');
	expect(messages[0].text).toContain('https://shipyard.example/#email=student%40svyasa-sas.edu.in&token=123456');
});
test('rejects SMTP recipient rejection', async () => {
	const factory = (() => ({
		sendMail: () => Promise.resolve({ accepted: [], rejected: ['student@svyasa-sas.edu.in'] })
	})) as unknown as typeof nodemailer.createTransport;
	await rejects(
		createOtpSender({ SMTP_PASSWORD: 'password' }, factory)(
			'student@svyasa-sas.edu.in',
			'123456',
			'https://shipyard.example'
		),
		/rejected/
	);
});
test('migrates OAuth storage once and preserves existing users and projects', () => {
	const dir = mkdtempSync(join(tmpdir(), 'shipyard-smtp-'));
	dirs.push(dir);
	const path = join(dir, 'db.sqlite');
	const old = new Database(path);
	old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,created_at INTEGER,google_sub TEXT);
 CREATE UNIQUE INDEX users_google_sub ON users(google_sub);
 CREATE TABLE sessions(digest TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);
 CREATE TABLE oauth_flows(digest TEXT PRIMARY KEY,verifier TEXT,nonce TEXT,expires_at INTEGER);
 INSERT INTO users VALUES ('legacy','student@svyasa-sas.edu.in',1,'old-google-sub');
 INSERT INTO sessions VALUES ('old','legacy',9999999999999);`);
	old.close();
	const db = openDatabase(path);
	expect(db.query('SELECT id,email FROM users').get()).toEqual({
		id: 'legacy',
		email: 'student@svyasa-sas.edu.in'
	});
	expect(
		db
			.query<{ name: string }, []>('PRAGMA table_info(users)')
			.all()
			.map((x) => x.name)
	).not.toContain('google_sub');
	expect(db.query("SELECT name FROM sqlite_master WHERE name='oauth_flows'").get()).toBeNull();
	expect(db.query('SELECT * FROM sessions').all()).toHaveLength(0);
	db.query(
		"INSERT INTO projects VALUES ('project','https://github.com/owner/repo','legacy','active','{}',1,1)"
	).run();
	db.query("INSERT INTO sessions VALUES ('new','legacy',9999999999999)").run();
	db.close();
	const reopened = openDatabase(path);
	expect(reopened.query('SELECT owner_id FROM projects').get()).toEqual({ owner_id: 'legacy' });
	expect(reopened.query('SELECT digest FROM sessions').get()).toEqual({ digest: 'new' });
	reopened.close();
});
