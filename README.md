# Tasklane

A personal task manager with Google and email OTP sign-in, private workspaces, and AI-assisted task drafting. Built with Next.js and TypeScript for the Hammoq developer assessment.

**[Live application](https://hammoq-assignment.vercel.app/) · [Source code](https://github.com/satya-pverma/hammoq-assignment)**

## Features

- **Flexible sign-in:** Google OAuth or a six-digit email OTP delivered through Brevo. Both methods share a workspace when the verified email matches.
- **Task management:** Create, edit, complete, reopen, and delete tasks. Set descriptions, priorities, statuses, and optional due dates.
- **Search and organization:** Server-side search, status and priority filters, sorting, and pagination with 10 tasks per page. Search is debounced by 500 ms.
- **Workspace overview:** Account-wide counts for total, in-progress, completed, and overdue tasks.
- **Undo deletion:** Restore a deleted task within 30 seconds, preserving its identity and creation date.
- **AI task drafting:** Describe work in plain language and let Gemini suggest task fields. Review and edit the draft before saving.
- **Responsive interface:** Desktop and mobile layouts with accessible forms, keyboard-operable dialogs, and loading, empty, error, and retry states.

## Technology stack

| Layer                         | Technology                                   |
| ----------------------------- | -------------------------------------------- |
| Application                   | Next.js 16 App Router, React 19, TypeScript  |
| Styling                       | Tailwind CSS, CSS, Lucide icons              |
| Authentication                | NextAuth.js, Google OAuth, email OTP         |
| Database                      | MongoDB Atlas with the native Node.js driver |
| Rate limiting and OTP storage | Upstash Redis                                |
| Transactional email           | Brevo REST API                               |
| AI drafting                   | Gemini REST API with structured output       |
| Validation and testing        | Zod, Vitest, ESLint, TypeScript              |
| Hosting                       | Vercel                                       |

## Getting started

### Prerequisites

- Node.js 22 LTS and npm
- A MongoDB database and an Upstash Redis database
- Google OAuth credentials and/or a Brevo API key with a verified sender
- A Gemini API key to enable AI drafting

### Install and run

```sh
git clone https://github.com/satya-pverma/hammoq-assignment.git
cd hammoq-assignment
npm ci
```

Create `.env.local` in the project root using the configuration below, then start the app:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000/). Configure at least one sign-in method before logging in.

### Environment variables

```dotenv
# Application and session signing
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-strong-random-secret

# Database
MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=hammoq

# Shared rate limits and OTP storage
UPSTASH_REDIS_REST_URL=your-upstash-rest-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token

# Google sign-in
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email OTP sign-in
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-verified-sender-email
BREVO_SENDER_NAME=Tasklane

# AI task drafting
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

| Variables                         | Requirement                                                                |
| --------------------------------- | -------------------------------------------------------------------------- |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Required for authentication.                                               |
| `MONGODB_URI`                     | Required for workspace and task storage.                                   |
| `MONGODB_DB`                      | Optional; defaults to `hammoqTasks` when omitted.                          |
| Upstash REST URL and token        | Required for task API rate limiting and email OTP. Use a read/write token. |
| Google client ID and secret       | Required for Google sign-in.                                               |
| Brevo API key and sender email    | Required for email OTP sign-in. The sender must be verified in Brevo.      |
| `BREVO_SENDER_NAME`               | Optional; defaults to `Tasklane`.                                          |
| `GEMINI_API_KEY`                  | Required for AI drafting; manual task entry remains available without it.  |
| `GEMINI_MODEL`                    | Optional; defaults to `gemini-3.1-flash-lite`.                             |

Generate a session secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep credentials in environment variables. Do not commit `.env.local` or expose secrets through `NEXT_PUBLIC_` variables. Restart the development server after changing configuration.

### Service configuration

**Google OAuth**

Create a Web application client in Google Auth Platform. Configure these URLs for local development:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

Add permitted test users while the OAuth application is in testing. The app requests account selection when starting Google sign-in.

**MongoDB Atlas**

Create a database user with read/write and index-creation permissions for the selected database. Configure network access for the application and URL-encode special characters in the connection-string password. The app creates `users` and `tasks` collections and their indexes as needed.

In development only, the server uses public DNS resolvers for Atlas SRV/TXT lookups to accommodate local DNS restrictions. This affects the Node.js process, not Windows settings. Production uses the platform's default DNS.

**Brevo and Upstash**

Use a Brevo API key, not an SMTP key, and a verified sender email. Configure an Upstash read/write REST token. Email sign-in appears when the required configuration is present.

## Implementation

### Authentication and workspace ownership

NextAuth manages encrypted JWT session cookies with a one-day lifetime. Google sign-in requires a verified email. Email OTP sign-in proves access to the recipient's inbox.

A unique, normalized email record maps both sign-in methods to a stable workspace owner ID. Every task query includes the authenticated owner; the browser cannot supply ownership. Emails are trimmed and lowercased, but provider-specific aliases are not merged.

For accounts created before email OTP support, sign in with Google once to register the email-to-workspace mapping. Legacy tasks are associated with the shared workspace during verified Google sign-in or session upgrade.

### OTP lifecycle

- Codes contain six cryptographically generated digits.
- Redis stores an HMAC digest with a **45-second TTL**, never the plaintext code.
- Verification and consumption are atomic, preventing reuse or concurrent replay.
- Five incorrect guesses invalidate the challenge.
- An active challenge cannot be overwritten by a resend.
- Expiry begins when the code is requested; delivery time uses part of that window.

### Rate limiting

Redis-backed limits are shared across application instances and separated by environment.

| Operation                   | Limit                                                |
| --------------------------- | ---------------------------------------------------- |
| Task reads                  | 120 per minute per user                              |
| Task writes, including Undo | 30 per minute per user                               |
| AI drafting                 | 5 per minute per user                                |
| OTP requests                | 3 per 15 minutes per email; 20 per 15 minutes per IP |
| OTP verification            | 10 per 5 minutes per email; 30 per 5 minutes per IP  |

Task API limit violations return `429` with `Retry-After`. Missing Redis configuration, errors, or timeouts block protected operations with a temporary error; this is an intentional fail-closed policy. Invalid authenticated task requests also consume their rate-limit budget.

### Task queries and deletion

Search, filtering, and sorting run in MongoDB before bounded offset pagination. Task counts cover the user's entire active workspace. Stable sort tie-breakers use creation time and task ID.

Deletion hides a task immediately. The owner can restore it for 30 seconds through an atomic update. A MongoDB TTL index performs eventual physical cleanup; restoration is rejected after the deadline even if cleanup has not yet run. The on-screen Undo action does not survive a page refresh.

### AI drafting

The server sends only the description entered in the AI panel, plus date/timezone context and extraction instructions, to Gemini. It does not send the user's task history or identity.

Gemini returns structured fields that are checked with Zod. Initial status is always **To do**. Generation has a 30-second timeout and no automatic retries. AI drafts never write to the database: users review the editable form and explicitly save it. Model output can still misinterpret intent or dates, so review is required.

## API overview

| Method   | Endpoint                | Purpose                                              |
| -------- | ----------------------- | ---------------------------------------------------- |
| `GET`    | `/api/tasks`            | List filtered, paginated tasks and workspace counts. |
| `POST`   | `/api/tasks`            | Create a task.                                       |
| `PUT`    | `/api/tasks/:id`        | Update an active task.                               |
| `DELETE` | `/api/tasks/:id`        | Soft-delete a task and return its Undo deadline.     |
| `PATCH`  | `/api/tasks/:id`        | Restore a task within the Undo window.               |
| `POST`   | `/api/tasks/draft`      | Generate an unsaved AI task draft.                   |
| `POST`   | `/api/auth/otp/request` | Request an email sign-in code.                       |

Task endpoints require authentication. Mutation endpoints also validate the request origin. NextAuth handles Google callbacks, OTP verification, and session endpoints under `/api/auth/*`.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The automated suite covers validation, account isolation, pagination, deletion and restoration, rate-limit failures, OTP handling, workspace linking, and AI endpoint behavior. Database, email, and model calls are mocked in unit tests; a passing suite does not replace deployment-level acceptance testing.

Manual acceptance should include Google and OTP sign-in for the same email, persistence after reload, isolation between different accounts, Undo expiry, rate-limit responses, and AI review before saving.

## Deployment

The application is deployed at **[hammoq-assignment.vercel.app](https://hammoq-assignment.vercel.app/)**.

For the production deployment:

1. Configure the environment variables in Vercel and set `NEXTAUTH_URL` to `https://hammoq-assignment.vercel.app`.
2. Add `https://hammoq-assignment.vercel.app` as a Google authorized JavaScript origin.
3. Add `https://hammoq-assignment.vercel.app/api/auth/callback/google` as the authorized redirect URI.
4. Configure Atlas network access and the verified Brevo sender. Keep the application and data-service regions close where practical.
5. Redeploy after configuration changes and verify both sign-in methods and the main task flows.

Preview environments need their own matching `NEXTAUTH_URL` and registered Google callback URL. The production build does not require a live database connection.

## Engineering decisions and tradeoffs

1. **One deployable application.** Next.js serves the React interface and Node.js API routes together, keeping deployment and authentication within one application.
2. **Verified identity and shared Redis state.** Workspace ownership is enforced in database queries; OTP consumption and rate limits work across server instances.
3. **Validation before persistence.** Zod checks task input and AI output. UI updates wait for confirmed server operations, and AI suggestions require review before saving.

Three features were deliberately left out of the assessment scope:

- **Teams, sharing, and roles:** these require a broader authorization model than personal task management.
- **Reminders and recurring tasks:** these require scheduling, delivery, and timezone policies beyond the core workflow.
- **Attachments and rich text:** plain text meets the objective without adding file storage and upload handling.

### Limitation to address with another day

Concurrent edits currently use last-write-wins. Two tabs editing the same task can overwrite one another. The next improvement would be version-based concurrency checks and a conflict message that lets the user reload before retrying.

Additional scale considerations include cursor pagination for deep task histories, indexed substring search alternatives, storage quotas, operational monitoring, and session revocation before JWT expiry.
