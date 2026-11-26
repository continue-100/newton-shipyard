import { json } from '@sveltejs/kit';
import { body, endpoint, requireUser } from '#lib/server/http.js';
import { getDatabase } from '#lib/server/runtime.js';
import { ApiError, rateLimit } from '#lib/server/auth.js';
import { importRepository, repositoryUrl } from '#lib/server/github.js';
import { getGitHubToken } from '#lib/server/github-auth.js';
import { listProjects, projectStatus, saveProject } from '#lib/server/projects.js';

export const GET = endpoint((event) => {
	const offset = Number(event.url.searchParams.get('offset') || 0);
	if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError(400, 'Invalid offset.');
	const projects = listProjects(getDatabase(), event.url.searchParams.get('status'), offset);
	return json({ projects, nextOffset: projects.length === 50 ? offset + 50 : null });
});

export const POST = endpoint(async (event) => {
	const user = requireUser(event);
	const input = await body(event);
	const status = projectStatus(input.status);
	const repo = repositoryUrl(input.repositoryUrl);
	const db = getDatabase();
	rateLimit(db, `submit:${user.id}`, 10, 60 * 60_000);
	if (db.query('SELECT id FROM projects WHERE repo_url = ?').get(repo.url))
		throw new ApiError(409, 'This repository is already listed.');
	const metadata = await importRepository(repo.url, await getGitHubToken());
	return json({ project: saveProject(db, user.id, status, metadata) }, { status: 201 });
});
