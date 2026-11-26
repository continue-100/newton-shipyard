import { expect, test } from 'bun:test';
import { getGitHubToken } from './github-auth';

test('configured tokens take priority without invoking the CLI', async () => {
	const cli = () => Promise.reject(new Error('CLI must not run'));
	expect(await getGitHubToken({ GITHUB_TOKEN: ' explicit ', GH_TOKEN: 'other' }, cli)).toBe(
		'explicit'
	);
	expect(await getGitHubToken({ GH_TOKEN: 'other' }, cli)).toBe('other');
});

test('uses the signed-in CLI when environment tokens are empty', async () => {
	expect(await getGitHubToken({ GITHUB_TOKEN: ' ' }, () => Promise.resolve('cli-token\n'))).toBe(
		'cli-token'
	);
});

test('allows anonymous public imports when CLI credentials are unavailable', async () => {
	expect(
		await getGitHubToken({}, () => Promise.reject(new Error('not signed in')))
	).toBeUndefined();
	expect(await getGitHubToken({}, () => Promise.resolve(''))).toBeUndefined();
});
