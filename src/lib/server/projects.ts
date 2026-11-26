import type { ShipyardDatabase } from './db';
import { ApiError } from './auth';
import type { RepositoryMetadata } from './github';

export const statuses = ['active', 'maintenance', 'seeking-maintainer'] as const;
export function projectStatus(value: unknown) {
	if (value === undefined) return 'active';
	if (!statuses.includes(value as (typeof statuses)[number]))
		throw new ApiError(400, 'Invalid project status.');
	return value as (typeof statuses)[number];
}
type Row = {
	id: string;
	repo_url: string;
	owner_id: string;
	status: string;
	metadata: string;
	created_at: number;
	updated_at: number;
};
const serialize = (row: Row) => ({
	id: row.id,
	repositoryUrl: row.repo_url,
	submittedBy: row.owner_id,
	status: row.status,
	metadata: JSON.parse(row.metadata) as RepositoryMetadata,
	createdAt: new Date(row.created_at).toISOString(),
	updatedAt: new Date(row.updated_at).toISOString()
});
export function listProjects(db: ShipyardDatabase, status: string | null, offset: number) {
	if (status) projectStatus(status);
	return db
		.query<Row, [string | null, string | null, number]>(
			`SELECT * FROM projects
		WHERE (? IS NULL OR status = ?) ORDER BY created_at DESC, id LIMIT 50 OFFSET ?`
		)
		.all(status, status, offset)
		.map(serialize);
}
export function findProject(db: ShipyardDatabase, id: string) {
	const row = db.query<Row, [string]>('SELECT * FROM projects WHERE id = ?').get(id);
	if (!row) throw new ApiError(404, 'Project not found.');
	return serialize(row);
}
export function saveProject(
	db: ShipyardDatabase,
	userId: string,
	status: string,
	metadata: RepositoryMetadata
) {
	const id = crypto.randomUUID();
	const now = Date.now();
	const result = db
		.query(
			`INSERT INTO projects(id, repo_url, owner_id, status, metadata, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repo_url) DO NOTHING`
		)
		.run(id, metadata.repositoryUrl, userId, status, JSON.stringify(metadata), now, now);
	if (!result.changes) throw new ApiError(409, 'This repository is already listed.');
	return findProject(db, id);
}
