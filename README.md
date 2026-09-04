# Nebula Mail

An AI-powered mail web application connected to a real Gmail account, where the AI assistant **controls the application UI** — it doesn't just answer questions in a chat window, it opens the compose form and fills it in, filters the inbox and shows the results, opens specific emails, and prepares replies, all by calling the exact same actions the on-screen controls call.

Built for the Nebula KnowLab "AI-Powered Mail Web Application" hiring task.

<p align="center">
  <!-- Replace with real screenshots/GIFs before submitting — see "Screenshots & Demo" below. -->
  <em>Screenshots and a short demo video go here before submission.</em>
</p>

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Architecture decisions & trade-offs](#architecture-decisions--trade-offs)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Google Cloud / Gmail OAuth setup](#google-cloud--gmail-oauth-setup)
- [Local installation & running](#local-installation--running)
- [Running tests](#running-tests)
- [AI assistant architecture](#ai-assistant-architecture)
- [Supported assistant commands](#supported-assistant-commands)
- [Real-time synchronization architecture](#real-time-synchronization-architecture)
- [Security considerations](#security-considerations)
- [Known limitations](#known-limitations)
- [What I'd improve with more time](#what-id-improve-with-more-time)
- [Screenshots & demo](#screenshots--demo)

## Features

**Mail client** (real Gmail data, no mocks)
- Inbox and Sent views — sender, subject, preview, date, unread state, click to read
- Full email detail view
- Compose with To/Cc/Subject/Body, real send via the Gmail API
- Reply and Forward, with proper quoting and RFC `In-Reply-To`/`References` threading
- Filters — date range, sender, keyword, read/unread — through UI controls
- Dark mode

**AI assistant** (the core of this project)
- Natural-language compose: opens the compose view and visibly fills To/Subject/Body
- Natural-language search & filter: results appear in the actual inbox list, not just as chat text
- Navigate & open a specific email by description ("the latest email from David")
- Context awareness: knows the current view/folder/filters and which email is open, so "reply to this" resolves correctly
- Reply/forward via the assistant
- Human-in-the-loop send confirmation, enforced server-side (not just prompted)
- Rich previews in the assistant panel (real email cards, not just text)

**Real-time sync**
- New mail appears in the inbox without a manual browser refresh, via Server-Sent Events
- Optional production-grade path using real Gmail Pub/Sub push notifications

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │                  Browser                     │
                     │                                               │
                     │   UI controls  ──┐          ┌── Assistant     │
                     │   (click, type)  │          │   panel (chat)  │
                     │                  ▼          ▼                 │
                     │        ┌───────────────────────────┐          │
                     │        │   Zustand app-store        │          │
                     │        │  (the ONE action layer:    │          │
                     │        │  navigateToInbox, openEmail│          │
                     │        │  fillCompose, sendEmail…)  │          │
                     │        └──────────────┬─────────────┘          │
                     │                       │ fetch()                │
                     └───────────────────────┼────────────────────────┘
                                              ▼
                     ┌─────────────────────────────────────────────┐
                     │              Next.js API routes               │
                     │                                                │
                     │  /api/mail/*      /api/assistant   /api/sync/* │
                     │       │                 │                │     │
                     │       ▼                 ▼                ▼     │
                     │  MailService      Claude tool-use    SSE +     │
                     │  (Gmail API)      + action validator  polling  │
                     └─────────────────────────────────────────────┘
```

The critical property: **an AI-dispatched action and a UI click resolve to the exact same function call.** The assistant never mutates mail state directly — it produces a validated `AppAction`, which is handed to the client, which runs it through the identical Zustand store method a button's `onClick` would call.

### Layer breakdown

| Layer | Location | Responsibility |
|---|---|---|
| UI components | `src/components/**` | Render state, call app-store actions on user interaction |
| Application action layer | `src/lib/store/app-store.ts` | Single source of truth for view/folder/filters/emails/compose/assistant state, and the only code that mutates it |
| AI action schema | `src/lib/types/actions.ts` | Zod-validated, discriminated-union contract for every action either the UI or the AI can trigger |
| AI assistant | `src/lib/ai/**` | Claude tool-use orchestration, action validation, dispatch to the store |
| Mail service | `src/lib/mail/**` | Provider-agnostic `MailService` interface; `GmailMailService` is the only file that imports `googleapis` |
| Auth | `src/lib/auth/**` | Google OAuth2 flow, encrypted server-side session |
| Real-time sync | `src/lib/sync/**`, `src/app/api/sync/**` | SSE stream + optional Gmail Pub/Sub push |

## Technology stack

- **Next.js 16** (App Router) + **TypeScript** — one deployable app for frontend and backend
- **Tailwind CSS v4** — custom design system via CSS variables (light/dark), not a component-library look
- **Zustand** — the shared application action layer
- **Zod** — runtime validation for every AI action and every API input
- **googleapis** — official Gmail API client
- **iron-session** — encrypted, httpOnly session cookie for OAuth tokens (never sent to the browser)
- **@anthropic-ai/sdk** — Claude (`claude-opus-4-8`) with tool use for the assistant
- **Vitest** — unit/integration tests
- **lucide-react** — icons

## Architecture decisions & trade-offs

- **One action layer, not two.** The biggest architectural risk in "AI controls the UI" projects is ending up with parallel implementations — one path for clicks, one for AI commands — that drift apart. Every mutation goes through `app-store.ts`; `src/lib/ai/dispatch-actions.ts` is a thin switch statement that calls the same functions. This is enforced structurally, not just by convention: the AI's tools are Claude tool definitions that map 1:1 onto `AppActionSchema`, so there is no other shape an AI action can take.
- **The assistant never mutates mail state server-side, except read-only grounding.** When the model needs to resolve "the latest email from David" into a real ID, the server executes a real (read-only) Gmail search so the model can ground itself in actual data — but the resulting `OPEN_EMAIL`/`FILL_COMPOSE`/`SEND_EMAIL` actions are always handed back to the client to execute through the normal store, never executed directly by the assistant backend. This keeps "what can change my mailbox" to one code path.
- **Human-in-the-loop send is enforced server-side, not just prompted.** The system prompt tells Claude to always confirm before sending, but prompts aren't a security boundary. `validate-action.ts` rejects a `SEND_EMAIL` action unless the client's `UIContext.sendConfirmationPending` flag is true — which is only set after the assistant itself issued a `REQUEST_SEND_CONFIRMATION` in an earlier turn. A `SEND_EMAIL` without that precondition is downgraded to a confirmation request instead of silently dropped, so the user still gets a usable next step.
- **Grounding + action are the same tool call.** `SEARCH_EMAILS`/`FILTER_EMAILS` do double duty: the server executes them for real (so the model can reason about actual results) *and* they're forwarded as the UI action that updates the inbox. The alternative — a separate "just search" tool plus a separate "now filter the UI" tool — would have doubled the tool surface for no benefit.
- **Real-time sync is honestly polling under the hood, pushed via SSE.** See [Real-time synchronization architecture](#real-time-synchronization-architecture) for the full trade-off — I did not want to claim Gmail push notifications are wired up if the demo environment can't actually reach a public URL.
- **iron-session over a database.** There's no user database — a session cookie holding encrypted OAuth tokens is the entire persistence layer. This is the right amount of infrastructure for a single-account demo app; a multi-tenant product would need a real token store (e.g. per-user rows with encrypted refresh tokens) so tokens survive across devices/browsers.
- **In-process event bus for the Pub/Sub → SSE bridge.** `src/lib/sync/event-bus.ts` is a plain `EventEmitter`. It works for local dev and a single-instance deployment (the target here) but would need a real pub/sub (Redis, etc.) behind a multi-instance deployment — documented in the code and in Known Limitations.

## Prerequisites

- Node.js 20+ and npm
- A Google account (for Gmail OAuth)
- A Google Cloud project with the Gmail API enabled
- An Anthropic API key

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | Yes | `http://localhost:3000/api/auth/callback` for local dev |
| `SESSION_SECRET` | Yes | Random string, 32+ chars (`openssl rand -base64 32`) — encrypts the session cookie |
| `ANTHROPIC_API_KEY` | Yes | Enables the AI assistant |
| `GOOGLE_PUBSUB_TOPIC` | No | Only for the optional real Gmail push path — see below |
| `GMAIL_PUBSUB_VERIFICATION_TOKEN` | No | Shared-secret query token for the Pub/Sub webhook |
| `APP_BASE_URL` | No | Used when documenting/registering the public webhook URL |

## Google Cloud / Gmail OAuth setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or pick an existing one).
2. **APIs & Services → Library** → search for **Gmail API** → Enable.
3. **APIs & Services → OAuth consent screen**:
   - User type: External (or Internal if using a Workspace account)
   - Fill in app name, support email
   - Scopes: add `.../auth/gmail.readonly`, `.../auth/gmail.send`, `.../auth/gmail.modify`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - Under **Test users**, add the Google account you'll sign in with (required while the app is in "Testing" publishing status)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback`
   - Copy the generated **Client ID** and **Client Secret** into `.env.local`
5. That's it for the core app — sign-in, inbox, sent, compose, send, and search/filter (including via the assistant) all work at this point.

**Optional — real Gmail Pub/Sub push** (production-grade path referenced by the PDF; not required, since the app falls back to SSE + polling):

1. Enable the **Cloud Pub/Sub API** in the same project.
2. Create a Pub/Sub topic (e.g. `gmail-notify`) and grant Publish rights to `gmail-api-push@system.gserviceaccount.com`.
3. Create a **push subscription** on that topic pointing at `https://<your-public-url>/api/webhooks/gmail-pubsub?token=<GMAIL_PUBSUB_VERIFICATION_TOKEN>`. Since this needs a public HTTPS URL, use `ngrok http 3000` (or a real deployment) for local testing.
4. Set `GOOGLE_PUBSUB_TOPIC` (full form: `projects/<project-id>/topics/gmail-notify`) and `GMAIL_PUBSUB_VERIFICATION_TOKEN` in `.env.local`.
5. Call `POST /api/gmail/watch` once signed in (e.g. from the browser devtools console: `fetch('/api/gmail/watch', {method:'POST'})`) to register the watch. It expires after ~7 days and would need a renewal job in production.

## Local installation & running

```bash
npm install
cp .env.example .env.local   # then fill in the values above
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and grant the requested Gmail permissions.

## Running tests

```bash
npm test
```

53 tests across mail query building, Gmail message normalization, reply/forward draft construction, the AI action validator (including the send-confirmation gate), the assistant orchestration loop (compose/search/filter/navigate/open-email/reply intents, invalid input), and the application action layer itself (the Zustand store).

## AI assistant architecture

```
Natural language ("show unread from this week")
        │
        ▼
POST /api/assistant  { message, context: UIContext, history }
        │
        ▼
Claude (claude-opus-4-8) + tool definitions 1:1 with AppActionSchema
        │
        ├─ tool_use: SEARCH_EMAILS / FILTER_EMAILS
        │       │
        │       ▼
        │  server executes a REAL, read-only Gmail query (grounding)
        │       │
        │       ▼
        │  tool_result → model can reason over real IDs/subjects/dates
        │
        └─ tool_use: any other action (FILL_COMPOSE, OPEN_EMAIL, SEND_EMAIL, …)
                │
                ▼
        validate-action.ts — Zod schema check + semantic rules
        (e.g. SEND_EMAIL requires a pending confirmation)
                │
                ▼
        { reply, actions[], emailPreviews[] } returned to the browser
                │
                ▼
        dispatch-actions.ts runs each action through the SAME
        app-store methods the UI's onClick handlers use
                │
                ▼
        Visible UI change (compose fills in, inbox filters, email opens, …)
```

Key files: `src/lib/ai/tools.ts` (tool definitions), `src/lib/ai/assistant.ts` (orchestration loop, max 4 turns), `src/lib/ai/validate-action.ts` (the security boundary — re-validates every action regardless of what the model claims), `src/lib/ai/dispatch-actions.ts` (client-side execution).

The assistant is never allowed to execute arbitrary code — it can only ever produce one of the ten action types in `AppActionSchema`, and every payload is schema-validated before dispatch.

## Supported assistant commands

| Say this | What happens |
|---|---|
| "Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'" | Compose opens, fields visibly fill in, assistant asks to confirm before sending |
| "Yes, send it" (after the above) | The email is actually sent via Gmail |
| "Show me emails from the last 10 days" | Inbox filters to the last 10 days, real results shown |
| "Find the email from Sarah about the project update" | Assistant searches, inbox updates, reply describes what it found |
| "Open the latest email from David" | Assistant searches, resolves the most recent match, opens it in the detail view |
| "Reply to this" (while an email is open) | Reply prepared with correct recipient/subject/quoted thread, ready to edit and send |
| "Forward this to jane@example.com" | Forward prepared with the original content and headers |
| "Show only unread emails from this week" | Same filter state the UI's Unread/date-range controls use |

## Real-time synchronization architecture

**Primary mechanism (always on):** `GET /api/sync/stream` opens a Server-Sent Events connection per signed-in user. The server polls Gmail's `history.list` API every 15 seconds and pushes a `new_mail` event to the browser when new inbox messages appear; the client refreshes the inbox in place. This is a genuinely real push to the *browser* (SSE), even though the Gmail-side detection is a short interval poll — I'm calling that out explicitly rather than labeling ordinary polling as "real-time push," per the trade-off this task asks to document.

- Handles `historyId` expiry (Gmail retains ~7 days of history) by resyncing from "now" rather than erroring the connection.
- The browser's native `EventSource` reconnects automatically on drops, which also re-reads the session cookie — a natural point to pick up a refreshed OAuth token.

**Optional production path:** `POST /api/gmail/watch` registers a real `users.watch()` Pub/Sub subscription. `POST /api/webhooks/gmail-pubsub` receives Gmail's push notification and wakes the matching user's SSE loop immediately via an in-process event bus (`src/lib/sync/event-bus.ts`), rather than waiting for the next poll tick. This is a pure latency optimization on top of the same polling logic — if it's not configured (no public URL, no topic), the app runs correctly on the polling fallback alone.

**Known constraint:** the event bus is a single-process `EventEmitter`. It bridges the webhook to the SSE stream correctly for local dev and a single-instance deployment, but a horizontally-scaled deployment would need a shared pub/sub (Redis, etc.) so a webhook landing on instance A can wake a stream held open on instance B.

## Security considerations

- OAuth tokens are stored only in an encrypted, httpOnly, `SameSite=Lax` session cookie (`iron-session`) — never sent to or readable by client-side JavaScript.
- Every mail-mutating route requires a valid session; `withMailService()` throws `AuthRequiredError` → HTTP 401 otherwise, and the client bounces back to the sign-in screen on any 401.
- Every AI action is re-validated server-side against `AppActionSchema` (Zod, discriminated union) regardless of what the model claims — malformed or unknown action types are rejected before they ever reach the client.
- `SEND_EMAIL` is only accepted when the request's `UIContext.sendConfirmationPending` is true, which the client can only set by first receiving a `REQUEST_SEND_CONFIRMATION` — the model cannot skip the confirmation step even if it tries to.
- The assistant cannot execute arbitrary code or arbitrary tool calls — its entire capability surface is the ten Claude tools in `tools.ts`, each mapped 1:1 to a validated action.
- Server logs never contain raw provider errors: Gaxios/googleapis errors can carry the OAuth `Authorization` header in `.config`; `src/lib/log-safe.ts` extracts only a message/stack and redacts anything resembling a token before logging (see the `security:` commit for the specific issue this fixed).
- No secrets are committed — `.env.local` is gitignored, `.env.example` has no real values, and `GOOGLE_CLIENT_SECRET`/`ANTHROPIC_API_KEY`/`SESSION_SECRET` are read only server-side (`process.env`), never bundled into client code.
- The Pub/Sub webhook checks a shared-secret token and never uses the Gmail credentials itself — it only relays "check for new mail" to the SSE stream, which then queries Gmail using that specific signed-in user's own session tokens.

## Known limitations

- **Real-time sync is single-process.** See above — a multi-instance production deployment needs a shared pub/sub instead of the in-memory event bus.
- **No token storage beyond the session cookie.** Signing in on a second browser/device starts a fresh OAuth flow; there's no server-side user/token table.
- **Gmail watch renewal isn't automated.** The optional Pub/Sub watch expires after ~7 days; a production deployment would need a scheduled job to call `/api/gmail/watch` again before expiry.
- **Attachments are read-only.** The compose form doesn't support adding attachments to a new email (existing attachments on received mail are listed and named, not downloadable in-app).
- **Single Gmail account per session.** No multi-account switching.
- **The assistant's grounding search is capped at 10 results** to keep prompts small — a request that genuinely matches hundreds of emails will only ground on the first page.

## What I'd improve with more time

- Automated Playwright/Cypress end-to-end tests driving the actual demo scenarios in a real browser against a test Gmail account.
- A real per-user token store (e.g. a small Postgres table) instead of session-cookie-only persistence, so sign-in survives across devices and a background job can renew Gmail watches.
- Redis-backed pub/sub for the real-time sync bridge, to support multi-instance deployment.
- Thread/conversation view (grouping messages by `threadId` in the UI, not just under the hood).
- Streaming the assistant's response token-by-token instead of waiting for the full turn.
- Attachment upload support in compose.

## Screenshots & demo

_Add screenshots or a short screen recording here before submitting, showing:_
1. _Compose via natural language — fields visibly filling in, then the confirmation step_
2. _Search/filter via natural language — the main inbox updating with real results_
3. _"Open the latest email from David" — the assistant navigating to the detail view_
4. _"Reply to this" while an email is open_
5. _A new email arriving and the inbox updating without a manual refresh_
