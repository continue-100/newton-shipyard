import { json } from '@sveltejs/kit';
import { body, endpoint, requireUser } from '#lib/server/http.js';
import { getDatabase } from '#lib/server/runtime.js';
import { ApiError } from '#lib/server/auth.js';
import { findProject, projectStatus } from '#lib/server/projects.js';

export const GET = endpoint((event) =>
	json({ project: findProject(getDatabase(), event.params.id!) })
);

export const PATCH = endpoint(async (event) => {
	const user = requireUser(event);
	const input = await body(event);
	const db = getDatabase();
	const project = findProject(db, event.params.id!);
	if (project.submittedBy !== user.id)
		throw new ApiError(403, 'Only the submitter can update this listing.');
	if (input.status === undefined) throw new ApiError(400, 'Provide a project status.');
	db.query('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(
		projectStatus(input.status),
		Date.now(),
		project.id
	);
	return json({ project: findProject(db, project.id) });
});
