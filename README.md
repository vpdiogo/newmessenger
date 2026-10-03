# New Messenger

A minimal real-time messenger built to study the Node.js ecosystem and system design fundamentals.

The project starts as a modular monolith: one Node.js application owns the HTTP API, WebSocket connections, and future message persistence. It deliberately introduces infrastructure only when a concrete requirement exists.

## Current Status

The initial scaffold is complete. It currently provides:

- A Fastify application written in strict TypeScript.
- `GET /health` for service health checks.
- `GET /ws` for WebSocket connection acceptance.
- PostgreSQL available through Docker Compose.
- ESLint, Prettier, type checking, tests, and production builds.

Authentication, conversations, message persistence, and message delivery are not implemented yet.

## Stack

- Node.js LTS and TypeScript
- Fastify and `@fastify/websocket`
- PostgreSQL 17
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
pnpm dev
```

The HTTP server listens on `http://localhost:3000` by default. PostgreSQL is exposed on `localhost:5435`.

Check application health:

```bash
curl http://localhost:3000/health
```

Open a WebSocket connection in a browser console:

```js
const socket = new WebSocket("ws://localhost:3000/ws");
socket.addEventListener("message", console.log);
```

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
```

## Project Structure

```text
src/
  config/       Environment configuration
  modules/      Feature modules
  app.ts        Fastify application factory
  server.ts     Process entry point
test/           Focused application tests
docs/
  architecture/ Architecture decisions and boundaries
  development/  Local setup instructions
```

## Documentation

- [Initial architecture](docs/architecture/initial-architecture.md)
- [Local development setup](docs/development/setup.md)
- [Project guidelines](AGENTS.md)

## Next Increment

The next implementation increment adds PostgreSQL migrations and the initial data model for users, conversations, memberships, and messages.
