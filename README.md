# Tasklane

A private task manager built for the Hammoq developer assessment. Next.js App Router, TypeScript, MongoDB, Google sign-in through NextAuth.js, and Zod validation.

## Features

- Google sign-in and sign-out; verified Google accounts only.
- Create, edit, delete, complete, and reopen tasks.
- Title, description, status, priority, and optional due date.
- Search title and description; filter by status or priority; sort by newest, priority, or due date.
- Task summaries and overdue view, responsive layouts, keyboard-accessible native dialogs, loading, error, retry, and empty states.
- Every database query uses the authenticated Google account ID. The browser never chooses an owner.

## Local setup

Use Node.js 22 LTS or later. Run `npm ci`.

Create `.env.local` yourself with these values. Do not commit secrets:

```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-random-secret-of-at-least-32-bytes
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=hammoqTasks
```

Generate a secret using `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.

### Google

Create a Google Cloud project, configure the OAuth consent screen, and create an OAuth client with application type **Web application**. Set the authorized JavaScript origin to `http://localhost:3000` and authorized redirect URI to `http://localhost:3000/api/auth/callback/google`. Add your own account and the evaluator's account as test users while the consent screen is in testing. Choose External if evaluators are outside your Google organization.

### MongoDB Atlas

Create an Atlas cluster and a database user with read/write permission for `hammoqTasks`. Copy the application connection string into `MONGODB_URI`; URL-encode special characters in the database password. Configure Atlas network access to allow the application's outbound connections. For deployment, use the narrowest network access supported by your Vercel plan; broad internet access is a convenience tradeoff and should not be the long-term production setting. The app creates a compound index on owner ID and creation time automatically; the database user needs permission to create this index.

Run `npm run dev`, open http://localhost:3000, and sign in. No fake account or authentication bypass is included. Without credentials the app shows a setup message.

## Vercel

1. Put the source in a Git repository and import it into Vercel as a Next.js project.
2. Set all six environment variables in the intended Vercel environment. Set `NEXTAUTH_URL` to the exact HTTPS deployment origin, with no path. Use a separate production secret.
3. Add that origin and `https://YOUR-DOMAIN/api/auth/callback/google` to the Google OAuth client.
4. Configure Atlas network access for Vercel, then deploy. Keep database and hosting regions close together.
5. For preview deployments, use a stable preview hostname, configure its exact callback URL, and give that deployment its own matching `NEXTAUTH_URL`. Unconfigured rotating preview domains will not work with Google OAuth or the write-origin check.

Build does not need a live database. Google sign-in and authenticated CRUD must be verified against the configured deployment before submission.

## Checks

```sh
npm run lint
npm test
npm run build
```

Tests cover invalid input, impossible dates, owner injection, anonymous requests, cross-origin writes, malformed IDs, and owner-scoped update/delete queries. They mock MongoDB and sessions; they do not replace an integration test with live Google and MongoDB.

Manual acceptance: sign in with account A, create/edit/complete/reopen/delete a task, reload to verify persistence, test filters and mobile layout, sign out, sign in with account B and verify A's tasks are absent. Also check Escape and keyboard navigation in the task dialog, and the retry state when the database is unavailable.

## Design decisions

1. **One Next.js application:** React UI and Node.js route handlers deploy together on Vercel. A separate Express service would add deployment and cross-origin complexity without helping this assessment.
2. **Google authentication and server-owned identity:** NextAuth handles OAuth, CSRF protection for auth, and encrypted session cookies. A verified Google provider account ID becomes the owner of every task; ownership is enforced in the actual database query, including mutations. JWT sessions last one day. No Google access token is exposed to the client.
3. **Validate at the trust boundary:** Zod validates every create/update body, including strict rejection of unexpected fields and valid date-only values. MongoDB connections are reused per running server instance with a bounded pool and connection timeout. UI updates wait for server success, keeping failed operations from looking saved.

Task dates represent calendar dates, not UTC instants. Overdue checks use the browser's local calendar date. Task content is rendered as plain text by React. Mutation routes require a matching Origin header in addition to a session. Public tasks and shared cached data are not used.

## Three deliberate omissions

- **Teams, sharing, and roles:** private personal tasks meet the objective; shared permissions would materially expand authorization requirements.
- **Notifications and recurring tasks:** they require background scheduling, delivery infrastructure, and timezone policies beyond a 24-hour assessment.
- **Attachments and rich-text editing:** uploads add storage and file security concerns; plain text covers the core workflow.

## One limitation and an additional day

The task list fetches all of the signed-in user's tasks and filters them in the browser. This is straightforward for an assessment but does not scale to large task histories. With another day, add cursor-based server pagination, server-side filters, matching indexes, and integration tests for page boundaries and account isolation.

## Production readiness boundaries

This uses production-oriented practices, but has not been operated at production scale. Before an unrestricted public launch, add distributed request throttling and per-user quotas, operational monitoring, backup/restore verification, and automated browser/integration checks. Simultaneous edits currently use last-write-wins; there is no conflict resolution. Stateless sessions cannot be centrally revoked before expiry. These are explicit operational limits, not claims of completed work.

## Assessment submission

Submit the deployed URL, source repository URL, and your own short on-camera recording. Use `docs/video-outline.md` as speaking notes. Explain the decisions in your own words and demonstrate the live app. Do not submit secrets or Google/MongoDB credentials.

## Verification notes

The production build, TypeScript check, lint, and 16 automated tests passed during implementation. Live Google OAuth, MongoDB persistence, account-to-account integration, and visual browser QA still require verification. The current dependency audit reports 16 moderate advisories in the ESLint development-tool dependency chain; no application runtime dependency was reported in that audit. Forced breaking downgrades were not applied.
