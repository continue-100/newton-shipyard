import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
async function cliToken() {
	const { stdout } = await execFileAsync('gh', ['auth', 'token', '--hostname', 'github.com'], {
		timeout: 5000,
		maxBuffer: 16_384,
		encoding: 'utf8'
	});
	return stdout;
}

// Resolve at request time so local CLI credentials never enter the build output.
export async function getGitHubToken(
	env: { GITHUB_TOKEN?: string; GH_TOKEN?: string } = {
		GITHUB_TOKEN: process.env.GITHUB_TOKEN,
		GH_TOKEN: process.env.GH_TOKEN
	},
	readCliToken: () => Promise<string> = cliToken
): Promise<string | undefined> {
	const configured = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim();
	if (configured) return configured;
	try {
		return (await readCliToken()).trim() || undefined;
	} catch {
		// Public imports still work without gh, subject to anonymous API limits.
		return undefined;
	}
}
