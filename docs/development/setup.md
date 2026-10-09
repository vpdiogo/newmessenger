# Local Development Setup

## Prerequisites

- Node.js LTS, managed with `nvm`.
- `pnpm`, enabled through Corepack.

## Initialize the Project

```bash
nvm install --lts
nvm use --lts

corepack enable

pnpm init
pnpm pkg set type=module

pnpm add -D typescript@npm:@typescript/typescript6@^6.0.2 @types/node tsx
```

## Approve Required Build Scripts

`tsx` uses `esbuild`, which includes a build script. Recent versions of pnpm require explicit approval before running dependency build scripts.

```bash
pnpm approve-builds
```

Select `argon2` and `esbuild`, then confirm the selection. This is an expected installation step, not an application error.

## Configure TypeScript

```bash
pnpm exec tsc6 --init \
  --strict \
  --target ES2024 \
  --module NodeNext \
  --moduleResolution NodeNext \
  --rootDir src \
  --outDir dist \
  --sourceMap \
  --declaration \
  --declarationMap

mkdir -p src test
```

## Run PostgreSQL Locally

Start the local database container:

```bash
docker compose up -d
docker compose ps
```

The database is available at:

```text
postgresql://newmessenger:newmessenger@localhost:5435/newmessenger
```

Copy the example environment file before adding local values:

```bash
cp .env.example .env
```

Stop the container while preserving its data:

```bash
docker compose down
```

Open a PostgreSQL shell when needed:

```bash
docker compose exec postgres psql -U newmessenger -d newmessenger
```

## Run Migrations

Apply all pending migrations:

```bash
pnpm migration:up
```

Create a new JavaScript migration:

```bash
pnpm migration:create add-users
```

Revert the most recently applied migration:

```bash
pnpm migration:down
```

## Run the Application

Start the backend after the database, environment file, and migrations are
ready:

```bash
pnpm dev
```

The backend listens on `http://localhost:3000`. Keep this process running while
developing the web client.

## Use Visual Studio Code

Open the repository root in Visual Studio Code. The `.vscode/extensions.json` file recommends the ESLint and Prettier extensions.

The workspace settings format JavaScript and TypeScript files with Prettier and run ESLint fixes whenever a file is explicitly saved. Reload the VS Code window if the project was already open when the workspace settings were added.

## Run the Web Client

The Vue client lives in `apps/web`. Copy its local environment example, then
start it in a second terminal while the backend is running:

```bash
cp apps/web/.env.example apps/web/.env
pnpm web:dev
```

It listens on `http://localhost:5173` and calls `VITE_API_BASE_URL`, which
defaults to `http://localhost:3000`. The backend permits that origin through
`CORS_ORIGIN`; set a different value in `.env` when the frontend runs elsewhere.

## Manually Verify Real-Time Messaging

Use two browser sessions, such as a normal window and a private window:

1. Register two users and sign in to each session.
2. Create a direct conversation from one account using the other user's email.
3. In the other session, click **Refresh** and select the new conversation.
4. Send a message in one session and confirm that it appears in the other
   without a refresh.
5. Use browser DevTools to take one session offline, then send a message from
   the other session. Restore the network and confirm that the disconnected
   client recovers the missed message after reconnecting.

## Verify Conversation Navigation and Discovery

- Select a non-first conversation and reload. Its ID should remain in the
  `conversation` query parameter, and its participant and history should be
  restored. Switching conversations and using browser Back/Forward should
  restore the corresponding selection.
- In a signed-in session, open `/app?conversation=<id>`. Only an ID in that
  user's returned list can load history. Invalid IDs fall back to the first
  conversation without adding a browser-history entry; other query parameters
  and the hash remain intact. A failed initial list query should keep the
  requested URL until retry succeeds.
- With a draft in the selected conversation, click its item again or refresh
  the list. The draft and transcript should remain unchanged, and existing
  contacts should stay visible while the refresh is pending or if it fails.
- From another account, create a conversation with the signed-in recipient
  and send its first message. The recipient's list should discover it without
  **Refresh**, while an existing selection and draft remain intact. Selecting
  the discovered conversation should display its message history.
- Test a discovery while a list query is delayed. Events arriving during that
  request should trigger a grouped follow-up instead of being lost or producing
  concurrent requests. Disconnect the recipient, create another conversation,
  and reconnect to verify list recovery.
- Create a conversation remotely without sending a message. While the socket
  stays connected, manual **Refresh** remains necessary to discover it.
- Try the signed-in user's email with different casing; no creation request
  should be sent, and the form should explain the self-conversation restriction.
  An unknown email should produce distinct feedback. Editing the field should
  clear creation feedback without clearing an independent list error.

## Verify Session Verification Recovery

- Sign in, select a non-first conversation, and add another query parameter and
  hash to the URL. Temporarily take the API offline, then reload. The token and
  full `/app` URL should remain, but no dashboard content should render; the
  session verification screen should offer **Retry**.
- Restore the API and select **Retry**. The original URL, conversation
  selection, query parameters, and hash should remain intact after the dashboard
  becomes available.
- Replace the stored token with an invalid value and reload. A `401` from
  `/auth/me` should clear the token and redirect to the login screen. Network,
  rate-limit, server, and malformed-success failures should instead keep the
  token and require an explicit retry.

## Verify Message Recovery and Transcript Layout

- Press Enter with a non-empty draft and confirm exactly one HTTP message and
  real-time delivery. Shift+Enter must insert a newline without sending; the
  visible Send button must still work. Confirm the shortcut does not move focus
  or announce your own message as incoming.
- Confirm Enter does not send empty, whitespace-only, or oversized drafts,
  during initial history loading, or while a send is pending. Hold Enter and
  confirm key repeats do not send additional messages. Confirm IME composition
  and confirmation do not send accidentally; distinguish simulated composition
  events from testing an actual operating-system IME.
- Retry unchanged failed content with Enter and confirm the same client ID is
  reused. Edit failed content and confirm a new ID. Switch conversations during
  a delayed keyboard send and verify its response does not affect the new draft,
  selection, or announcements. Label simulated delays/failures in QA results.
- Open a conversation with more than 50 messages. It should display its latest
  page at the end; **Load earlier messages** adds preceding history without
  moving the message currently being read.
- Receive messages while near the end and while reading earlier content. Only
  the first case should follow the end automatically. Successful local sends
  should always reveal the sent message.
- Disconnect one session and send more than 50 messages from the other. After
  reconnecting, all missed messages should recover without duplicates, while
  the reader's position is retained when away from the end.
- Try a draft longer than 2,000 trimmed characters. The composer should keep
  the text, explain the limit, and block submission. Shortening it should allow
  sending without reloading.
- Simulate a failed message request. Retrying unchanged content should reuse
  its client ID. Editing failed content should leave retry mode and submit the
  edited text with a new ID. A response lost after persistence must not produce
  a duplicate on an unchanged retry.
- At a desktop viewport height around 680px, trigger conversation creation and
  refresh errors. The conversation list must retain usable scroll space and
  the page must stay within the viewport. The left pane can scroll internally
  when its profile, list, form, and feedback exceed the available height.

## Verify Conversation Accessibility

For frontend ownership/lifecycle regression QA, also leave the dashboard and
return quickly while the previous socket is closing. The replacement connection
must stay connected, with no extra socket or stale events from the old owner.
When reproducing delays with instrumentation, label that scenario as simulated.
After leaving the feature entirely, pending history, scroll effects, discovery,
and announcement callbacks must not alter the disposed feature.

Use Chrome with a screen reader, such as Orca on Linux, and two authenticated
sessions. Inspecting the accessibility tree alone does not confirm spoken output.

- Navigate the conversation buttons using Tab and activate them with Enter or
  Space. Only the selected button should expose `aria-current="true"`, with its
  full participant email. Focus styling and existing keyboard behavior must
  remain unchanged.
- Inspect the participant name as a level-two heading and the central pane as
  a region named by that heading. With no selection, its name is **Conversation**.
- Open a conversation and load earlier history: neither operation should read
  the transcript as a new announcement. Sending your own message and receiving
  one in another conversation must also remain silent.
- Receive a message in the selected conversation. Expect a polite announcement
  such as "friend@example.test says: Hello" without moving keyboard focus or
  changing the existing scroll-follow policy. Repeated delivery of the same
  message ID must not repeat it; identical text with distinct IDs should announce
  each message. Closely spaced incoming messages may be announced together.
- Disconnect long enough to expose the loss of connection, then reconnect with
  missed messages. Expect one loss announcement, no repeated notices for rapid
  retry attempts, an established-connection announcement, and only newly
  recovered incoming messages. Brief disconnects should not produce noisy alerts.
- Switch conversations while an announcement is queued. Old queued content must
  not be announced in the new conversation. Confirm the two visually hidden
  polite status regions do not change desktop layout or add page scrolling.

Record the browser, screen reader, spoken results, and any environment limitation
separately from automated tests and accessibility-tree checks. Do not claim
screen-reader validation or general WCAG compliance from DOM checks alone.

## Verify the Toolchain

```bash
pnpm exec tsx --version
pnpm exec tsc6 --version
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm web:typecheck
pnpm web:test
pnpm web:build
```
