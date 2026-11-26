import { openDatabase, type ShipyardDatabase } from './db';
import { importRepository } from './github';
import { getGitHubToken } from './github-auth';
import { findProject, saveProject } from './projects';

export const demoRepositories = ['https://github.com/prismio-lang/prismio'] as const;
const demoEmail = 'demo-projects@shipyard.invalid';

export async function seedDemoProjects(
	db: ShipyardDatabase,
	token?: string,
	importer: typeof importRepository = importRepository
) {
	const existing = (url: string) =>
		db.query<{ id: string }, [string]>('SELECT id FROM projects WHERE repo_url = ?').get(url);
	// Fetch before writing so a GitHub failure leaves the database unchanged.
	const metadata = await Promise.all(
		demoRepositories.map(async (url) => (existing(url) ? null : importer(url, token)))
	);
	return db
		.transaction(() => {
			return demoRepositories.map((url, index) => {
				const project = existing(url);
				if (project) return { created: false, project: findProject(db, project.id) };
				db.query(
					'INSERT INTO users(id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING'
				).run(crypto.randomUUID(), demoEmail, Date.now());
				const owner = db
					.query<{ id: string }, [string]>('SELECT id FROM users WHERE email = ?')
					.get(demoEmail)!;
				return { created: true, project: saveProject(db, owner.id, 'active', metadata[index]!) };
			});
		})
		.immediate();
}

if (import.meta.main) {
	const db = openDatabase(process.env.DATABASE_PATH || './data/shipyard.sqlite');
	try {
		const results = await seedDemoProjects(db, await getGitHubToken());
		for (const { created, project } of results)
			console.log(`${created ? 'Created' : 'Already listed'}: ${project.repositoryUrl}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Unable to seed demo projects.');
		process.exitCode = 1;
	} finally {
		db.close();
	}
}
