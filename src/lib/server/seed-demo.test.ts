import { afterEach, expect, mock, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { openDatabase } from './db';
import type { RepositoryMetadata } from './github';
import { listProjects, saveProject } from './projects';
import { demoRepositories, seedDemoProjects } from './seed-demo';

const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
	const db = openDatabase(':memory:');
	databases.push(db);
	return db;
}
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});

const metadata: RepositoryMetadata = {
	repositoryUrl: demoRepositories[0],
	name: 'prismio',
	description: 'Demo repository description',
	homepage: null,
	topics: ['language'],
	languages: { Rust: 100 },
	techStack: ['Rust'],
	readme: '# Prismio',
	readmeUrl: null,
	contributing: null,
	contributingUrl: null,
	lastContribution: null,
	goodFirstIssues: [],
	license: null,
	archived: false,
	stars: 1,
	forks: 0,
	openIssues: 0,
	fetchedAt: '2026-11-25T00:00:00.000Z'
};

test('imports card metadata and safely skips repeated seeds', async () => {
	const db = setup();
	const importer = mock(() => Promise.resolve(metadata));
	const first = await seedDemoProjects(db, 'test-token', importer);
	expect(importer).toHaveBeenCalledWith(demoRepositories[0], 'test-token');
	expect(first[0].created).toBe(true);
	expect(first[0].project.metadata).toEqual(metadata);
	expect(first[0].project.status).toBe('active');
	expect(listProjects(db, null, 0)).toEqual([first[0].project]);
	expect(await seedDemoProjects(db, undefined, importer)).toEqual([
		{ created: false, project: first[0].project }
	]);
	expect(importer).toHaveBeenCalledTimes(1);
	expect(db.query('SELECT * FROM users').all()).toHaveLength(1);
	expect(db.query('SELECT * FROM sessions').all()).toHaveLength(0);
});

test('preserves an existing submission, its owner, status, and metadata', async () => {
	const db = setup();
	db.query('INSERT INTO users VALUES (?, ?, ?)').run('student', 'student@svyasa-sas.edu.in', 1);
	const project = saveProject(db, 'student', 'maintenance', metadata);
	const importer = mock(() => Promise.resolve(metadata));
	expect(await seedDemoProjects(db, undefined, importer)).toEqual([{ created: false, project }]);
	expect(importer).not.toHaveBeenCalled();
	expect(db.query('SELECT * FROM users').all()).toHaveLength(1);
});

test('does not create demo users or projects when GitHub fails', async () => {
	const db = setup();
	await rejects(
		seedDemoProjects(db, undefined, () => Promise.reject(new Error('GitHub unavailable'))),
		/GitHub unavailable/
	);
	expect(db.query('SELECT * FROM users').all()).toHaveLength(0);
	expect(listProjects(db, null, 0)).toEqual([]);
});
