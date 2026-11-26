import { rejects } from 'node:assert/strict';
import { afterEach, describe, expect, test } from 'bun:test';
import { openDatabase, type ShipyardDatabase } from './db';
import { campusEmail, createAuth, rateLimit } from './auth';
import { importRepository, repositoryUrl } from './github';
import { findProject, listProjects, projectStatus, saveProject } from './projects';
import { body, requireUser } from './http';
import type { RequestEvent } from '@sveltejs/kit';

const databases: ShipyardDatabase[] = [];
function setup() {
	const db = openDatabase(':memory:');
	databases.push(db);
	const deliveries: { email: string; code: string }[] = [];
	const auth = createAuth(db, 'a'.repeat(32), (email, code) => {
		deliveries.push({ email, code });
		return Promise.resolve();
	});
	return { db, auth, deliveries };
}
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});
const email = 'student@svyasa-sas.edu.in';

describe('campus authentication', () => {
	test('normalizes exact campus domain', () => {
		expect(campusEmail(' Student@SVYASA-SAS.EDU.IN ')).toBe(email);
	});
	test.each([
		'a@gmail.com',
		'a@sub.svyasa-sas.edu.in',
		'a@svyasa-sas.edu.in.evil.com',
		'@svyasa-sas.edu.in',
		'a@svyasa-sas.edu.in\nb@evil.com',
		null
	])('rejects invalid email %s', (value) => {
		expect(() => campusEmail(value)).toThrow();
	});

	test('stores hashes, consumes codes once, and expires/revokes sessions', async () => {
		const { db, auth, deliveries } = setup();
		const now = Date.now();
		await auth.request(email, 'ip', now);
		const code = deliveries[0].code;
		expect(code).toMatch(/^[a-f0-9]{64}$/);
		expect(db.query<{ digest: string }, []>('SELECT digest FROM otp').get()!.digest).not.toBe(code);
		const session = auth.verify(email, code, 'ip', now)!;
		expect(auth.user(session.token, now)).toEqual(session.user);
		expect(auth.verify(email, code, 'ip', now)).toBeNull();
		expect(db.query<{ digest: string }, []>('SELECT digest FROM sessions').get()!.digest).not.toBe(
			session.token
		);
		expect(auth.user(session.token, now + 32 * 86400_000)).toBeNull();
		auth.logout(session.token);
		expect(auth.user(session.token, now)).toBeNull();
	});
	test('expires codes after ten minutes', async () => {
		const { auth, deliveries } = setup();
		await auth.request(email, 'ip', 1000);
		expect(auth.verify(email, deliveries[0].code, 'ip', 601000)).toBeNull();
	});
	test('locks verification after five wrong attempts', async () => {
		const { auth, deliveries } = setup();
		await auth.request(email, 'ip');
		const wrong = deliveries[0].code === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
		for (let i = 0; i < 5; i++) expect(auth.verify(email, wrong, 'ip')).toBeNull();
		expect(auth.verify(email, deliveries[0].code, 'ip')).toBeNull();
	});
	test('limits resends and replaces the previous code digest', async () => {
		const { db, auth, deliveries } = setup();
		await auth.request(email, 'ip', 1000);
		await rejects(auth.request(email, 'ip', 1001), /one minute/);
		await auth.request(email, 'ip', 61001);
		expect(deliveries).toHaveLength(2);
		expect(db.query('SELECT * FROM otp').all()).toHaveLength(1);
		expect(auth.verify(email, deliveries[1].code, 'ip', 61002)).not.toBeNull();
	});
	test('limits sending per recipient, IP and shared sender', async () => {
		const { db, auth } = setup();
		for (let i = 0; i < 5; i++) await auth.request(email, 'ip', 1000 + i * 61000);
		await rejects(auth.request(email, 'ip', 400000), /Too many/);
		db.query("INSERT OR REPLACE INTO rate_limits VALUES ('smtp-daily',400,?)").run(
			Date.now() + 86400_000
		);
		await rejects(auth.request('other@svyasa-sas.edu.in', 'other-ip'), /Too many/);
	});
	test('cleans up undelivered codes', async () => {
		const { db } = setup();
		const auth = createAuth(db, 'a'.repeat(32), () => Promise.reject(new Error('SMTP rejected')));
		await rejects(auth.request(email, 'ip'), /Email delivery failed/);
		expect(db.query('SELECT * FROM otp').get()).toBeNull();
	});
	test('does not send to non-campus recipients', async () => {
		const { auth, deliveries } = setup();
		await rejects(auth.request('outside@gmail.com', 'ip'), /campus|svyasa/);
		expect(deliveries).toHaveLength(0);
	});
	test('retains existing user IDs on verified email login', async () => {
		const { db, auth, deliveries } = setup();
		db.query('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').run('legacy', email, 1);
		await auth.request(email, 'ip');
		expect(auth.verify(email, deliveries[0].code, 'ip')!.user.id).toBe('legacy');
	});
	test('resets rate limits only after their window', () => {
		const { db } = setup();
		rateLimit(db, 'key', 1, 1000, 100);
		expect(() => rateLimit(db, 'key', 1, 1000, 200)).toThrow();
		expect(() => rateLimit(db, 'key', 1, 1000, 1100)).not.toThrow();
	});
});

const file = (content: string, html_url: string) => ({
	content: Buffer.from(content).toString('base64'),
	encoding: 'base64',
	size: content.length,
	html_url
});
function githubFetch(overrides: Record<string, unknown> = {}): typeof fetch {
	const responses: Record<string, unknown> = {
		'': {
			name: 'Demo',
			description: 'Campus tool',
			private: false,
			disabled: false,
			archived: false,
			default_branch: 'main',
			topics: ['campus'],
			license: { spdx_id: 'MIT' },
			stargazers_count: 2,
			forks_count: 1,
			open_issues_count: 3
		},
		'/languages': { TypeScript: 100 },
		'/readme?ref=main': file('# Demo', 'https://github.com/owner/demo/blob/main/README.md'),
		'/commits?per_page=1': [
			{
				sha: 'abc',
				html_url: 'https://github.com/owner/demo/commit/abc',
				commit: { committer: { date: '2026-01-01T00:00:00Z' } },
				author: { login: 'student' }
			}
		],
		'/community/profile': {
			files: {
				contributing: {
					html_url: 'https://github.com/owner/demo/blob/main/.github/CONTRIBUTING.md'
				}
			}
		},
		'/contents/.github/CONTRIBUTING.md?ref=main': file(
			'Send a PR',
			'https://github.com/owner/demo/blob/main/.github/CONTRIBUTING.md'
		),
		'/contents/package.json?ref=main': file('{"dependencies":{"svelte":"5"}}', ''),
		'/issues?state=open&labels=good%20first%20issue&per_page=10': [
			{ number: 1, title: 'Fix docs', html_url: 'https://github.com/owner/demo/issues/1' },
			{ number: 2, pull_request: {}, title: 'PR', html_url: '' }
		],
		...overrides
	};
	return ((url: string | URL | Request) => {
		const path = (url instanceof Request ? url.url : url.toString()).replace(
			'https://api.github.com/repos/owner/demo',
			''
		);
		const response = responses[path];
		return Promise.resolve(
			response instanceof Response
				? response
				: Response.json(response ?? {}, { status: response === undefined ? 404 : 200 })
		);
	}) as typeof fetch;
}
describe('GitHub importing and project persistence', () => {
	test('canonicalizes GitHub URL variants', () => {
		expect(repositoryUrl('https://github.com/Owner/Demo.git/').url).toBe(
			'https://github.com/owner/demo'
		);
	});
	test.each([
		'http://github.com/a/b',
		'https://evil.com/a/b',
		'https://github.com.evil.com/a/b',
		'https://user:pass@github.com/a/b',
		'https://github.com/a/b/tree/main',
		'https://github.com/a/b?x=y',
		'https://127.0.0.1/a/b',
		'file:///a/b'
	])('rejects unsupported or unsafe URLs %s', (url) => {
		expect(() => repositoryUrl(url)).toThrow();
	});
	test('imports metadata and persists projects with duplicate protection', async () => {
		const metadata = await importRepository(
			'https://github.com/owner/demo',
			undefined,
			githubFetch()
		);
		expect(metadata.techStack).toEqual(['TypeScript', 'svelte']);
		expect(metadata.readme).toBe('# Demo');
		expect(metadata.contributing).toBe('Send a PR');
		expect(metadata.lastContribution?.author).toBe('student');
		expect(metadata.goodFirstIssues).toHaveLength(1);
		const { db, auth, deliveries } = setup();
		await auth.request(email, 'ip');
		const user = auth.verify(email, deliveries[0].code, 'ip')!.user;
		const project = saveProject(db, user.id, 'active', metadata);
		expect(findProject(db, project.id)).toEqual(project);
		expect(listProjects(db, 'maintenance', 0)).toHaveLength(0);
		expect(listProjects(db, null, 0)).toHaveLength(1);
		expect(() => saveProject(db, user.id, 'active', metadata)).toThrow('already listed');
	});
	test('handles missing optional files and empty repos', async () => {
		const missing = () => new Response('', { status: 404 });
		const metadata = await importRepository(
			'https://github.com/owner/demo',
			undefined,
			githubFetch({
				'/readme?ref=main': missing(),
				'/commits?per_page=1': new Response('', { status: 409 }),
				'/community/profile': missing(),
				'/contents/package.json?ref=main': missing()
			})
		);
		expect(metadata.readme).toBeNull();
		expect(metadata.lastContribution).toBeNull();
		expect(metadata.contributing).toBeNull();
	});
	test('surfaces rate limits without saving incomplete metadata', async () => {
		await rejects(
			importRepository(
				'https://github.com/owner/demo',
				undefined,
				githubFetch({ '/languages': new Response('', { status: 429 }) })
			),
			/rate limit/
		);
	});
	test('rejects private repositories even with a server token', async () => {
		await rejects(
			importRepository(
				'https://github.com/owner/demo',
				'token',
				githubFetch({ '': { private: true } })
			),
			/public/
		);
	});
	test('validates statuses', () => {
		expect(projectStatus(undefined)).toBe('active');
		expect(() => projectStatus('other')).toThrow();
	});
});

describe('request boundaries', () => {
	function event(payload: string, origin = 'https://shipyard.test') {
		return {
			url: new URL('https://shipyard.test/api/projects'),
			request: new Request('https://shipyard.test/api/projects', {
				method: 'POST',
				headers: { origin, 'content-type': 'application/json' },
				body: payload
			}),
			locals: { user: null }
		} as RequestEvent;
	}
	test('rejects unauthenticated mutation', () => {
		expect(() => requireUser(event('{}'))).toThrow('Sign in');
	});
	test('rejects cross-origin requests', async () => {
		await rejects(body(event('{}', 'https://evil.test')), /same-origin/);
	});
	test('rejects invalid and oversized JSON', async () => {
		await rejects(body(event('[]')), /JSON object/);
		await rejects(body(event('x'.repeat(4097))), /too large/);
	});
	test('parses JSON objects', async () => {
		expect(await body(event('{"status":"active"}'))).toEqual({ status: 'active' });
	});
});
