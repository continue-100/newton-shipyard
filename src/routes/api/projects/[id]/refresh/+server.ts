import { json } from '@sveltejs/kit';
import { body, endpoint, requireUser } from '#lib/server/http.js';
import { getDatabase } from '#lib/server/runtime.js';
import { ApiError, rateLimit } from '#lib/server/auth.js';
import { importRepository } from '#lib/server/github.js';
import { getGitHubToken } from '#lib/server/github-auth.js';
import { findProject } from '#lib/server/projects.js';

export const POST = endpoint(async (event) => {
	const user = requireUser(event);
	await body(event);
	const db = getDatabase();
	const project = findProject(db, event.params.id!);
	if (project.submittedBy !== user.id)
		throw new ApiError(403, 'Only the submitter can refresh this listing.');
	rateLimit(db, `refresh:${project.id}`, 3, 60 * 60_000);
	const metadata = await importRepository(project.repositoryUrl, await getGitHubToken());
	db.query('UPDATE projects SET metadata = ?, updated_at = ? WHERE id = ?').run(
		JSON.stringify(metadata),
		Date.now(),
		project.id
	);
	return json({ project: findProject(db, project.id) });
});
