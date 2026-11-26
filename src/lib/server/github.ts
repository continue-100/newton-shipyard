import { ApiError } from './auth';

export function repositoryUrl(value: unknown) {
	if (typeof value !== 'string' || value.length > 300)
		throw new ApiError(400, 'Enter a public GitHub repository URL.');
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new ApiError(400, 'Enter a valid repository URL.');
	}
	const match = /^\/([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d._-]+?)\/?$/i.exec(url.pathname);
	if (
		url.protocol !== 'https:' ||
		url.hostname !== 'github.com' ||
		url.port ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!match
	)
		throw new ApiError(
			400,
			'Use https://github.com/owner/repository. Only public GitHub repositories are supported.'
		);
	const owner = match[1].toLowerCase();
	const repo = match[2].replace(/\.git$/i, '').toLowerCase();
	if (!repo || repo === '.' || repo === '..') throw new ApiError(400, 'Invalid repository name.');
	return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

type Repo = {
	name: string;
	description: string | null;
	private: boolean;
	archived: boolean;
	disabled: boolean;
	homepage: string | null;
	topics: string[];
	default_branch: string;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	license: { spdx_id: string } | null;
};
type File = { content: string; encoding: string; html_url: string; size: number };
type Commit = {
	sha: string;
	html_url: string;
	commit: { committer: { date: string }; message: string };
	author: { login: string } | null;
};
type Issue = { title: string; html_url: string; number: number; pull_request?: unknown };

export async function importRepository(
	value: unknown,
	token?: string,
	request: typeof fetch = fetch
) {
	const repo = repositoryUrl(value);
	const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
	async function get<T>(path: string, optional = false): Promise<T | null> {
		let response: Response;
		try {
			response = await request(`${base}${path}`, {
				redirect: 'error',
				signal: AbortSignal.timeout(12_000),
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'Shipyard',
					...(token ? { Authorization: `Bearer ${token}` } : {})
				}
			});
		} catch {
			throw new ApiError(502, 'GitHub could not be reached. Please try again.');
		}
		if (optional && (response.status === 404 || response.status === 409)) return null;
		if (response.status === 404)
			throw new ApiError(422, 'Repository not found. Submit a public GitHub repository.');
		if (response.status === 403 || response.status === 429)
			throw new ApiError(503, 'GitHub access or rate limit reached. Please try again later.');
		if (!response.ok) throw new ApiError(502, 'GitHub metadata request failed.');
		return (await response.json()) as T;
	}
	const details = (await get<Repo>(''))!;
	if (details.private || details.disabled)
		throw new ApiError(422, 'Only accessible public repositories can be indexed.');
	const ref = `?ref=${encodeURIComponent(details.default_branch)}`;
	const [languages, readme, commits, community, issues, manifest] = await Promise.all([
		get<Record<string, number>>('/languages'),
		get<File>(`/readme${ref}`, true),
		get<Commit[]>('/commits?per_page=1', true),
		get<{ files: { contributing: { html_url: string } | null } }>('/community/profile', true),
		get<Issue[]>('/issues?state=open&labels=good%20first%20issue&per_page=10', true),
		get<File>(`/contents/package.json${ref}`, true)
	]);
	const decode = (file: File | null) =>
		file?.encoding === 'base64' && file.size <= 200_000
			? Buffer.from(file.content, 'base64').toString('utf8')
			: null;
	const contributingPath = community?.files.contributing?.html_url;
	let contributing: File | null = null;
	if (contributingPath) {
		const path = new URL(contributingPath).pathname
			.split('/')
			.slice(5)
			.map(encodeURIComponent)
			.join('/');
		if (path) contributing = await get<File>(`/contents/${path}${ref}`, true);
	}
	let dependencies: string[] = [];
	try {
		const pkg = JSON.parse(decode(manifest) || '{}') as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort();
	} catch {
		/* A malformed manifest must not prevent importing the repository. */
	}
	return {
		repositoryUrl: repo.url,
		name: details.name,
		description: details.description,
		homepage: details.homepage,
		topics: details.topics || [],
		languages: languages || {},
		techStack: [...new Set([...Object.keys(languages || {}), ...dependencies])],
		readme: decode(readme),
		readmeUrl: readme?.html_url || null,
		contributing: decode(contributing),
		contributingUrl: contributingPath || null,
		lastContribution: commits?.[0]
			? {
					sha: commits[0].sha,
					url: commits[0].html_url,
					date: commits[0].commit.committer.date,
					author: commits[0].author?.login || null
				}
			: null,
		goodFirstIssues: (issues || [])
			.filter((issue) => !issue.pull_request)
			.map(({ number, title, html_url }) => ({ number, title, url: html_url })),
		license: details.license?.spdx_id || null,
		archived: details.archived,
		stars: details.stargazers_count,
		forks: details.forks_count,
		openIssues: details.open_issues_count,
		fetchedAt: new Date().toISOString()
	};
}

export type RepositoryMetadata = Awaited<ReturnType<typeof importRepository>>;
