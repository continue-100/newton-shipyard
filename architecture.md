# Architecture

> To recreate:
>
> ```sh
> bun x sv@1.7.0 create --template minimal --types ts --add prettier eslint vitest="usages:unit,component" enhanced-img devtools="plugins:rolldown,vite,vitest" sveltekit-adapter="adapter:bun" mdsvex="plugins:anchors,code-blocks,external-links,figures,page-data,embeds,link-check,references,elements" ai-tools="ide:vscode,other+tools:mcp,svelte-code-writer,svelte-core-bestpractices,svelte-file-editor+mcpSetup:remote+agentsMd:yes+optInSkills:none" --install bun newton-shipyard
> ```

## Backend

The backend uses the Bun runtime, SQLite, Google OAuth authentication, and public GitHub repository metadata imports. The frontend is still the starter page. Production requires **Bun 1.4+**, as required by the configured SvelteKit Bun adapter.

### Setup

1. Run `bun install`.
2. Copy `.env.example` to `.env`.
3. Create a Google Cloud OAuth client of type **Web application** and configure its consent screen.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ORIGIN`. Register the exact authorized redirect URI `http://localhost:5173/api/auth/google/callback` for local development, and `https://your-domain/api/auth/google/callback` for production.
5. Optionally set `GITHUB_TOKEN` to increase API rate limits. Imports still reject private repositories.
6. Run `bun run --bun dev`.

For production, set `ORIGIN` to the public HTTPS origin, then run `bun run --bun build` and `bun ./build`. Keep `DATABASE_PATH` on a persistent writable volume. Back up SQLite with a SQLite-aware backup tool, including WAL state. This implementation is intended for a single application instance with a local database. Only configure forwarded client-address headers when requests pass through a proxy you control.

### API

Start sign-in by navigating to `/api/auth/google`. Google redirects back to `/api/auth/google/callback`; successful authentication sets the session cookie and redirects to `/`. The backend exchanges the authorization code directly and uses `jose` to verify the signed Google ID token. No authentication framework is used.

All JSON mutation requests require an `Origin` header matching the application origin and `Content-Type: application/json`. Browser requests send Origin automatically. Send `{}` for logout and refresh. Authentication uses the HttpOnly `shipyard_session` cookie; clients must retain and send cookies. Secure cookies are enabled on HTTPS.

| Method | Path                        | JSON body / behavior                                                                             |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/api/auth/google`          | Redirects to Google sign-in with a campus domain hint                                            |
| GET    | `/api/auth/google/callback` | Validates the OAuth response, sets the session cookie, and redirects home                        |
| GET    | `/api/auth/me`              | Current user, or `null`                                                                          |
| POST   | `/api/auth/logout`          | `{}`; revokes session                                                                            |
| GET    | `/api/projects`             | Public listings; optional `status` and `offset` query parameters; 50 per page                    |
| POST   | `/api/projects`             | `{"repositoryUrl":"https://github.com/owner/repo","status":"active"}`; requires verified session |
| GET    | `/api/projects/:id`         | Public project details                                                                           |
| PATCH  | `/api/projects/:id`         | `{"status":"seeking-maintainer"}`; submitter only                                                |
| POST   | `/api/projects/:id/refresh` | `{}`; reimports metadata; submitter only                                                         |

Statuses are `active`, `maintenance`, and `seeking-maintainer`. The default submission status is `active`. These are submitter-declared statuses; last-commit data and archive flags are stored separately. There is no automatic status classification or scheduled refresh yet.

Google sign-in requires an email on the exact `svyasa-sas.edu.in` domain, a verified email claim, and the matching Google Workspace hosted-domain claim (`hd`). The domain hint on the consent screen is not proof of eligibility. ID tokens are checked against Google's signing keys for signature, issuer, audience, expiry, nonce, and authorized party when present. OAuth uses a browser-bound state cookie, a single-use server-side flow expiring after 10 minutes, and S256 PKCE. Login starts are limited per client IP. Google access and refresh tokens are not stored.

Users are identified by Google's stable subject (`sub`). Existing users link by their Google-verified campus email, retaining project ownership. The database migration removes the old code table and invalidates existing sessions once, requiring a Google sign-in. Sessions expire after 30 days and tokens are stored as hashes. Expired OAuth flows are cleaned up on login start; periodic session cleanup is not yet scheduled.

### Repository imports

Only public `https://github.com/owner/repository` URLs are supported initially, with optional `.git` suffix or trailing slash. URLs are canonicalized to prevent duplicate listings. Imports use the GitHub REST API with request timeouts and reject redirects; repositories are never cloned or executed. GitLab, Bitbucket, self-hosted Git, and private repositories need separate adapters.

Each import stores repository name, description, homepage, topics, languages, package.json dependency names, README text and URL, contribution guidelines text and URL when available, latest default-branch commit and author, up to 10 good-first-issue results excluding pull requests, license, archive flag, stars, forks, issue count, and fetch timestamp. Tech-stack detection currently combines languages with root package.json dependencies; other ecosystems and nested monorepo manifests need additional detectors. Latest contribution means the latest default-branch commit, not all branch or issue activity.

Missing README, manifest, guidelines, or commits are allowed. Files over 200 KB are linked but not stored as text. Other GitHub failures abort the import; failed refreshes preserve the previous metadata. Repository Markdown is stored as untrusted text: sanitize it if a later frontend renders HTML. Verifying a campus email authorizes directory submission; it does not establish ownership of the GitHub repository. Listing edits belong to the verified submitter.

The integration follows [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), the [GitHub repository API](https://docs.github.com/en/rest/repos/repos), [repository contents API](https://docs.github.com/en/rest/repos/contents).

### Validation

- `bun run test:backend`: Google token signatures and claims, OAuth state/PKCE/expiry/replay, session expiry and revocation, database migration, rate limits, repository URL safety, metadata imports and failures, SQLite persistence, duplicate protection, and HTTP input boundaries.
- `bun run --bun check`: TypeScript and Svelte diagnostics.
- `bun run --bun build`: production bundle.
- `bun run test`: backend tests plus the starter Vitest unit/component suite. The starter suite requires Node and Playwright Chromium (`bun x playwright install chromium`).
