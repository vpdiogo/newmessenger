# New Messenger

[![Node.js 22](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify 5](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-2EA44F)](LICENSE)

A portfolio messenger for learning the Node.js ecosystem and system design.
A Vue client talks to one Fastify modular monolith; PostgreSQL stores messages,
HTTP creates them, and WebSocket delivers best-effort events. Missed events
recover through HTTP history.

## What Works

- English/Brazilian Portuguese UI with automatic browser-language selection and local language settings.
- Email/password registration and login, with JWT session verification/recovery.
- One-to-one conversations, URL-based selection and recent/earlier history.
- Idempotent message sends, manual retry, Enter to send and Shift+Enter for a newline.
- Per-conversation drafts and send recovery retained while the dashboard stays open.
- Realtime delivery, reconnect recovery, accessible announcements and independent
  transcript/contact-list scrolling.
- Optional per-user HTTP write quotas and five-connection WebSocket occupancy.
  Both enforcement switches default off; the 32 KiB body limit is always active.

Delivery and limits are local to one backend instance. The MVP uses browser-local
JWT storage and has no email-ownership verification, profile management or Redis.
See the
[architecture and limitations](docs/architecture/initial-architecture.md).

## Run Locally

Use Node.js LTS, Corepack and Docker Compose. The local workflow is verified with
Node.js 24; `render.yaml` separately pins the deployed backend to Node.js 22.12.0.
`package.json` pins pnpm 12.9.1.

From an existing checkout, install dependencies and create local configuration.
Skip either copy if that file already exists; preserve your local values.

```bash
corepack pnpm install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env
docker compose up -d --wait
corepack pnpm migration:up
corepack pnpm dev
```

In another terminal, from the repository root:

```bash
corepack pnpm web:dev
```

Open `http://localhost:5173`. The API uses port 3000 and local PostgreSQL uses 5435. `curl http://localhost:3000/health` returns `{ "status": "ok" }` when the
HTTP server is running; it does not test database connectivity.

For environment variables, troubleshooting and checks, follow the
[development guide](docs/development/setup.md). Example credentials are for local
development only.

## Language Settings

Open Settings at the bottom of the desktop participant panel, or in the header
on other screens and compact layouts. Choose Automatic, Português (Brasil) or
English. Changes apply immediately and are saved in this browser when storage is
available. Automatic uses browser preferences at startup, falling back to
Brazilian Portuguese.

## Documentation

| Need                                             | Guide                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Set up an existing clone and run checks          | [Local development](docs/development/setup.md)                    |
| Understand boundaries and design decisions       | [Architecture](docs/architecture/initial-architecture.md)         |
| Call the API and understand recovery contracts   | [API and client contracts](docs/architecture/api-contracts.md)    |
| Check behavior in a browser or over TCP          | [Verification guide](docs/development/verification.md)            |
| Understand abuse limits and deferred IP controls | [API abuse protection](docs/architecture/api-abuse-protection.md) |
| Deploy, configure or roll back                   | [Production deployment](docs/deployment/production.md)            |
| Work as a contributor or agent                   | [Project guidelines](AGENTS.md)                                   |

The documented hosting topology uses Vercel for the web client, Render for the
API and Supabase for PostgreSQL. See the deployment guide for the recorded public
URLs and operational limitations; repository defaults do not establish current
production settings. Add infrastructure only for a demonstrated requirement.

---

<p align="center">Made with ❤️ by <a href="https://github.com/vpdiogo">Vitor Diogo</a></p>
