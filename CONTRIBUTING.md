# Contributing to Shipyard

## Gmail SMTP OTP sign-in

Shipyard sends sign-in codes from `2392608478@svyasa-sas.edu.in` through `smtp.gmail.com:465` over TLS. No paid mail provider or Google OAuth client is used. Only recipients at `@svyasa-sas.edu.in` can sign in and submit projects.

1. Sign into the sending Google account and enable 2-Step Verification.
2. Create a [Google app password](https://myaccount.google.com/apppasswords) named Shipyard. If app passwords are unavailable for the school account, its Workspace administrator must allow them. Use the app password, not the regular account password. See [Google's app password instructions](https://support.google.com/accounts/answer/185833).
3. Copy `.env.example` to `.env` if you do not already have a `.env`. Set `SMTP_PASSWORD` to that app password.
4. Set `AUTH_SECRET` to a random secret generated with `bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this value private and stable across restarts.
5. Run `bun install` and `bun run --bun dev`. Set `ORIGIN` to your public HTTPS origin in production.

The sender account and SMTP host are fixed in `src/lib/server/smtp.ts`. Gmail's normal sending quotas and school account policies apply; no payment integration is needed. SMTP passwords and codes are never logged. Actual email delivery requires a valid app password and SMTP access from your server.

| Method | Endpoint                | JSON body                                               |
| ------ | ----------------------- | ------------------------------------------------------- |
| POST   | `/api/auth/request-otp` | `{"email":"student@svyasa-sas.edu.in"}`                 |
| POST   | `/api/auth/verify-otp`  | `{"email":"student@svyasa-sas.edu.in","code":"123456"}` |
| GET    | `/api/auth/me`          | Current user or `null`                                  |
| POST   | `/api/auth/logout`      | `{}`                                                    |

Mutation requests need `Content-Type: application/json` and a matching `Origin` header. Browsers supply Origin automatically. Verification sets an HttpOnly, SameSite session cookie (Secure on HTTPS). Keep cookies for subsequent project submissions.

Codes expire after 10 minutes, allow five guesses, and can be used once. Resending replaces the previous code, with a one-minute cooldown, five requests per email per hour, and 20 requests per IP per hour. The application also caps total OTP send attempts at 400 per 24-hour window. Sessions expire after 30 days. Codes use keyed hashes; session tokens are stored as hashes. Migration removes Google OAuth state and identity links, revokes old sessions once, and retains user IDs and project ownership.

Run `bun run test:backend` for OTP, SMTP-message, migration, and repository backend tests. Run `bun run --bun check` and `bun run --bun build` for type checking and production validation. Production requires Bun 1.4 or newer.

## Build and run

Use Bun 1.4+ and install the [GitHub CLI](https://cli.github.com/). Authenticate on the machine that will **run** Shipyard:

```sh
gh auth login --hostname github.com
gh auth status
bun install
bun run --bun check
bun run test:backend
bun run --bun build
bun ./build
```

If `gh auth status` already reports an active account, keep using that login. Repository submissions and refreshes resolve GitHub credentials at runtime: `GITHUB_TOKEN` takes priority, then `GH_TOKEN`, then the signed-in CLI via `gh auth token --hostname github.com`. Leave the environment token variables blank to use your existing CLI login. Tokens are read privately by the server and are not embedded in the build or returned to clients. Only public repositories can be imported.

Keep your configured `.env` alongside `package.json` when starting the server from the project directory. Set `ORIGIN` to the public HTTPS origin in production, and keep `DATABASE_PATH` on persistent writable storage. For development, use `bun run --bun dev` instead of the build/start commands.

A GitHub CLI login on your development machine does not transfer with the build. On a different deployment host, either install `gh` and sign in as the operating-system user running Shipyard, or configure `GITHUB_TOKEN` there. Without either, public imports fall back to GitHub's lower anonymous API rate limits. Building itself does not require a GitHub token.

## Demo projects

Run `bun run seed:demo` to import `prismio-lang/prismio` into the configured
`DATABASE_PATH` (default: `./data/shipyard.sqlite`). The command uses the same live
GitHub importer and credential resolution as project submissions. It fetches the
repository metadata, languages, README, contribution guide, latest contribution,
and starter issues, then stores an active listing that `/api/projects` serves to
the project cards. Reload the page after seeding.

Seeding is explicit and never runs at application startup. Repeating the command
skips existing repositories without changing their owner, status, or metadata.
New demo listings belong to `demo-projects@shipyard.invalid`, a reserved account
outside the allowed sign-in domain; seeding creates no session and sends no email.
GitHub import failures exit with a nonzero status and leave listings unchanged.
Add more demo repository URLs in `src/lib/server/seed-demo.ts` when needed.

## Frontend animation

Anime.js is installed and can be imported with `import { animate } from 'animejs'`.
Vite handles the package without additional configuration. In Svelte components, create
DOM animations in `onMount` and clean them up when the component is destroyed. Respect
`prefers-reduced-motion` when adding motion. No Anime.js animations run by default.
