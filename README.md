# New Messenger

[![Node.js 22](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify 5](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-2EA44F)](LICENSE)

A minimal real-time messenger built to study the Node.js ecosystem and system design fundamentals.

The project starts as a modular monolith: one Node.js application owns the HTTP API, WebSocket connections, and message persistence. It deliberately introduces infrastructure only when a concrete requirement exists.

## Current Status

The initial scaffold is complete. It currently provides:

- A Fastify application written in strict TypeScript.
- `GET /health` for service health checks.
- An authenticated `GET /ws` WebSocket endpoint for real-time events.
- PostgreSQL available through Docker Compose.
- User registration, login, JWT access tokens, and a protected current-user endpoint.
- Authenticated creation and listing of one-to-one conversations.
- Persisted messages for direct conversations and chronological message history.
- Best-effort real-time `message.created` delivery to connected members.
- A public single-instance MVP deployed with Vercel, Render, and Supabase.
- ESLint, Prettier, type checking, tests, and production builds.

The application keeps WebSocket connections in memory, so real-time delivery is
best-effort and scoped to one application instance. PostgreSQL remains the
source of truth for message history.

The repository also contains a Vue web client in `apps/web`. It supports
registration, login, local JWT session restoration, direct conversations,
message history, HTTP message sending, and native browser WebSocket updates.
It reconnects after an interrupted socket and recovers missed messages through
the HTTP history endpoint.

## Stack

- Node.js LTS and TypeScript
- Fastify and `@fastify/websocket`
- PostgreSQL 17
- Vue 3, Vite, Tailwind CSS, and Vue Router
- Zod for environment validation
- ESLint and Prettier
- Node.js test runner through `tsx`

## Prerequisites

- Node.js LTS
- pnpm, enabled through Corepack
- Docker and Docker Compose

## Run Locally

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm migration:up
pnpm dev
```

The HTTP server listens on `http://localhost:3000` by default. PostgreSQL is exposed on `localhost:5435`.

Check application health:

```bash
curl http://localhost:3000/health
```

## Run the Web Client

Keep the backend running, then start the Vue application in another terminal:

```bash
cp apps/web/.env.example apps/web/.env
pnpm web:dev
```

Open `http://localhost:5173`. The authenticated dashboard uses `fetch` for
API requests and the native browser WebSocket API for `message.created`
events. `VITE_API_BASE_URL` defaults to `http://localhost:3000` when it is not
set.

## Authentication

Set `JWT_SECRET` to a secret with at least 32 characters; `.env.example` contains a development-only value. Apply migrations before starting the server.

Register with an email address and a password from 12 to 256 characters:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"correct-horse-battery-staple"}'
```

The registration and login endpoints return an `accessToken`. Send it as a Bearer token to retrieve the signed-in user:

```bash
curl http://localhost:3000/auth/me \
  -H 'authorization: Bearer <accessToken>'
```

Open an authenticated WebSocket connection in a browser console:

```js
const socket = new WebSocket("ws://localhost:3000/ws", [
  "bearer",
  "<accessToken>",
]);
socket.addEventListener("message", console.log);
```

The web client provides the same flow at `/register` and `/login`. For this MVP,
the access token is stored in browser local storage and validated with
`GET /auth/me` when the application loads. Production session design should
revisit this trade-off before handling sensitive user data.

## Conversations

Create a direct conversation with another user's email. Repeating the same request
returns the existing conversation instead of creating a duplicate. The legacy
`participantId` field remains supported for API compatibility.

```bash
curl -X POST http://localhost:3000/conversations \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <accessToken>' \
  -d '{"participantEmail":"person@example.com"}'
```

List the signed-in user's direct conversations:

```bash
curl http://localhost:3000/conversations \
  -H 'authorization: Bearer <accessToken>'
```

## Messages

Send a message as a member of a conversation:

```bash
curl -X POST http://localhost:3000/conversations/<conversation-id>/messages \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <accessToken>' \
  -d '{"clientMessageId":"<uuid>","content":"Hello"}'
```

`clientMessageId` is generated by the client. Retrying the same ID for the
same sender returns the original message without creating or delivering a
duplicate. The Vue client retains the same ID when retrying unchanged content
after an unconfirmed send. Editing failed content creates a new logical message
with a new ID; it does not cancel a message already accepted by the server.
Message content is trimmed and must contain 1 to 2,000 characters. The composer
shows the limit and prevents submission of oversized content.

Read a conversation's message history:

```bash
curl 'http://localhost:3000/conversations/<conversation-id>/messages?limit=50&cursor=<message-id>' \
  -H 'authorization: Bearer <accessToken>'
```

History is returned as `{ "messages": [...], "nextCursor": "..." }`. Omit
`cursor` for the oldest page and use `nextCursor` to move forward. This remains
the default behavior and is used to recover messages after a reconnect.

To open the latest page instead, use `direction=backward`:

```bash
curl 'http://localhost:3000/conversations/<conversation-id>/messages?limit=50&direction=backward' \
  -H 'authorization: Bearer <accessToken>'
```

With `direction=backward`, `nextCursor` identifies the oldest message in the
returned page when earlier messages remain. Request that cursor with the same
direction to load the preceding page. Both directions return each page in
chronological `(createdAt, id)` order; `nextCursor` is `null` at the end.
The web client opens recent history and offers **Load earlier messages**.
Incoming messages follow the transcript end only when the reader is near it;
loading earlier history preserves the reading position.

## Available Commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm web:dev
pnpm web:test
pnpm web:typecheck
pnpm web:build
```

## Project Structure

```text
src/
  config/       Environment configuration
  modules/      Feature modules
  app.ts        Fastify application factory
  server.ts     Process entry point
test/           Focused application tests
apps/web/        Vue client
docs/
  architecture/ Architecture decisions and boundaries
  development/  Local setup instructions
```

## Documentation

- [Initial architecture](docs/architecture/initial-architecture.md)
- [Local development setup](docs/development/setup.md)
- [Production deployment](docs/deployment/production.md)
- [Project guidelines](AGENTS.md)

## Next Increment

The next increment evaluates Redis Pub/Sub when a concrete need for delivery
across multiple backend instances exists.

---

<p align="center">Made with ❤️ by <a href="https://github.com/vpdiogo">Vitor Diogo</a></p>
