# Tasklane

A private task manager built for the Hammoq developer assessment. Next.js App Router, TypeScript, MongoDB, Google sign-in through NextAuth.js, and Zod validation.

## Features

- Google or email OTP sign-in and sign-out. Both methods share one workspace for the same verified email.
- Create, edit, delete, complete, and reopen tasks. Undo deletion within 30 seconds.
- Title, description, status, priority, and optional due date.
- Server-side search, status/priority filters, and sorting by newest, priority, or due date. Ten tasks per page with Previous/Next controls; summaries cover all active tasks.
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

Create an Atlas cluster and a database user with read/write permission for `hammoqTasks`. Copy the application connection string into `MONGODB_URI`; URL-encode special characters in the database password. Configure Atlas network access to allow the application's outbound connections. For deployment, use the narrowest network access supported by your Vercel plan; broad internet access is a convenience tradeoff and should not be the long-term production setting. The app creates an index on owner, deletion state, creation time, and task ID, plus a TTL index on deletion time. The database user needs permission to create these indexes. Existing active documents do not need a migration.

Run `npm run dev`, open http://localhost:3000, and sign in. No fake account or authentication bypass is included. Without credentials the app shows a setup message.

## Vercel

Local development uses public DNS resolvers (`1.1.1.1` and `8.8.8.8`) in the server process before connecting to MongoDB, to work around local Atlas SRV/TXT lookup failures. This does not change Windows settings. The override runs only when `NODE_ENV=development`; production and Vercel use their default DNS. Node.js DNS settings apply process-wide to DNS resolver calls, not exclusively to MongoDB.

1. Put the source in a Git repository and import it into Vercel as a Next.js project.
2. Set the Google/MongoDB/Redis environment variables and any enabled Brevo variables in the intended Vercel environment. Set `NEXTAUTH_URL` to the exact HTTPS deployment origin, with no path. Use a separate production secret.
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

Tests cover invalid input, impossible dates, owner injection, anonymous requests, cross-origin writes, malformed IDs, bounded pagination, literal search, global summaries, and owner/time-scoped deletion and restoration. They mock MongoDB and sessions; they do not replace an integration test with live Google and MongoDB.

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

Simultaneous edits use last-write-wins. If two browser tabs edit the same task, the later save can overwrite the earlier change without warning. With another day, add optimistic concurrency checks using a task version and show a conflict message so users can reload before retrying.

## Production readiness boundaries

This uses production-oriented practices, but has not been operated at production scale. Before an unrestricted public launch, add per-user storage quotas, operational monitoring, backup/restore verification, and automated browser/integration checks. Simultaneous edits currently use last-write-wins; there is no conflict resolution. Stateless sessions cannot be centrally revoked before expiry. These are explicit operational limits, not claims of completed work.

## Assessment submission

Submit the deployed URL, source repository URL, and your own short on-camera recording. Use `docs/video-outline.md` as speaking notes. Explain the decisions in your own words and demonstrate the live app. Do not submit secrets or Google/MongoDB credentials.

## Verification notes

The production build, TypeScript check, lint, and 70 automated tests pass. Live endpoint checks with isolated diagnostic accounts verified bounded pages, summaries, literal search, sorting, account isolation, soft deletion, restoration, and rejection after the 30-second undo window. Visual browser QA and final Google OAuth acceptance on Vercel remain manual checks. The current dependency audit reports 16 moderate advisories in the ESLint development-tool dependency chain; no application runtime dependency was reported in that audit. Forced breaking downgrades were not applied.

## Pagination and undo deletion

`GET /api/tasks` returns `{ tasks, total, page, pageSize, summary }`. It accepts page (1–10000), pageSize (1–50, default 10), status, priority, search (up to 120 characters), sort, and an optional local calendar date named today. Filters and sorting run before pagination; summary counts cover all active tasks for the authenticated user. Search treats special characters as literal text. Every sort uses creation time and task ID as deterministic tie-breakers. The client resets to page one when filters change and moves back if deleting the last task empties the final page.

Pagination uses bounded offset/limit queries for simple numbered navigation. Deep pages and literal substring searches still scan or sort server-side data; cursor pagination and indexed search would be appropriate for very large accounts. Concurrent inserts or deletions can shift offset page boundaries.

DELETE soft-deletes the owner's active task and returns an undoUntil deadline. PATCH on that task restores it only during the 30-second server-enforced window. Deleted tasks are excluded from lists, counts, and edits. Restoring preserves identity and creation time. A MongoDB TTL index removes deleted documents after the window; cleanup is asynchronous, so documents may remain physically stored briefly after restoration is already disallowed. This is an undo window, not a trash/recovery feature; the on-screen Undo action does not persist across a page refresh.

## API rate limiting

Upstash Redis is required for authenticated task API requests in development and production. Create a Redis database and configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN locally and in Vercel. Use a read/write REST token; rate-limit counters require writes. Keep these server-side secrets private. A read-only token will not work.

The API uses shared sliding-window budgets per authenticated user: 120 reads per minute and 30 writes per minute. Creating, editing, deleting, and restoring tasks share the write budget. Rate-limit keys use SHA-256 hashes of user IDs and separate namespaces for development, preview, and production. The limiter runs after authentication and before request parsing or MongoDB access; invalid authenticated requests also consume budget. No task-list caching is introduced.

Exceeded limits return 429 with Retry-After and X-RateLimit headers. Redis timeouts, errors, or missing credentials return 503 with Retry-After: 5. This deliberately fails closed: the app temporarily cannot access tasks if Redis is unavailable. Redis requests and the limiter have a two-second timeout; retries and limiter analytics are disabled. Existing client error states display the API retry message; requests are not automatically replayed.

## Email OTP login with Brevo

Set BREVO_API_KEY and BREVO_SENDER_EMAIL in your local environment and in Vercel. The sender email must already be verified in Brevo. BREVO_SENDER_NAME is optional and defaults to Tasklane. Use a Brevo API key, not an SMTP key. Google login continues working when Brevo is not configured; the email login form appears only when the required settings are present. NEXTAUTH_SECRET, NEXTAUTH_URL, MongoDB, and Upstash Redis remain required.

The server creates a cryptographically random six-digit code, stores an HMAC digest with a Redis EX 45 TTL, and sends the code through Brevo. The plaintext code is never stored in Redis, logged, or returned by the API. Expiry starts when the code is requested, so email delivery time uses part of the 45-second window. Verification atomically consumes a valid code. Five incorrect attempts delete that challenge. A code cannot be reused, and an unexpired code cannot be overwritten by a resend. Delivery failures invalidate only that request's challenge.

Abuse controls: at most 3 send requests per email per 15 minutes, 20 per IP per 15 minutes, 10 verification attempts per email per 5 minutes, and 30 per IP per 5 minutes. On Vercel the forwarding IP comes from platform headers; local development uses one shared development IP bucket. Redis failures block sign-in.

A users collection holds the normalized verified email, display name, and stable workspace owner ID, with a unique email index. Only verified Google profiles or successful OTP verification may resolve an identity. Emails are trimmed and lowercased; provider-specific aliases or dot variations are not merged. New accounts need no separate registration.

For pre-existing Google accounts, refresh while signed in or sign in with Google once after this update to register the email-to-workspace mapping before switching to OTP. If OTP was used first, the next Google sign-in merges only that verified Google identity's legacy tasks into the shared workspace. Existing task IDs and content are preserved. Email-only login cannot discover an old Google account ID that was never associated with an email in the database. Existing duplicate/malformed documents in a manually populated users collection must be resolved before its unique email index can be created.

Manual acceptance: request a code from a verified Brevo sender, sign in within 45 seconds, confirm the same tasks as Google, and test resend after expiry. Automated Redis checks use a fake delivery function and do not send emails. Live Brevo delivery requires valid sender credentials and must be verified separately.

## Gemini AI task drafting

Set GEMINI_API_KEY server-side in .env.local and Vercel. GEMINI_MODEL is optional and defaults to gemini-3.1-flash-lite. No extra SDK is required; the server calls Gemini's structured-output REST API with the key in a request header.

Open New task, describe the work in the optional Draft with AI panel, and click Fill task fields with AI. A validated suggestion fills the editable task form. Review all fields and click Create task to save; drafting never writes to MongoDB. Manual entry stays available when AI is unavailable. Closing the dialog cancels the browser request. Only the description deliberately entered in this panel is sent to Google, along with timezone/date context and the extraction instructions; existing tasks and user identity are not included.

The endpoint requires a signed-in user, matching origin, and a separate Redis budget of five AI drafts per minute per user. Input is limited to 2000 characters, output to 2048 tokens, and provider requests time out after 30 seconds with no automatic retries. AI requests count even if validation or the provider later fails. Redis failures block AI requests under the existing fail-closed policy. Gemini quota/billing failures return a temporary error without exposing provider details. The key, prompt, and generated text are not logged by the application.

The server computes today in the supplied valid IANA timezone, requests null for missing or ambiguous dates, validates returned dates and fields with Zod, and forces initial status to To do. AI can still misinterpret intent or dates; human review is required. Automated checks cover access control, origin validation, separate rate limits, malformed output, invalid dates, and provider failures. A live synthetic Gemini request verified structured drafting and timezone-relative tomorrow resolution without creating a task.

