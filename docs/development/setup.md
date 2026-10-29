# Local Development

Use this guide to prepare an existing clone and run the application. It does not
recreate package manifests, TypeScript configuration or migrations.

## Prerequisites

- Node.js LTS and Corepack. The local workflow is verified with Node.js 24;
  `render.yaml` pins Node.js 22.12.0 for the backend deployment separately.
- Docker with the Compose plugin.
- pnpm 12.9.1, selected by `package.json` through `corepack pnpm`.

Run commands below from the repository root. If Corepack is unavailable, install
it using its supported installation instructions. If package-signature checks
fail, fix/update the Corepack installation rather than disabling verification.

## Install and Configure

```bash
corepack pnpm install --frozen-lockfile
```

The workspace already permits `argon2` and `esbuild` build scripts through
`pnpm-workspace.yaml`; normal installation does not require editing approvals or
adding dependencies. For a new clone, create local configuration:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
```

Skip either copy if the file exists. Do not overwrite local values or commit
secrets. `.env.example` contains local development defaults only.

| Variable                             | Purpose/default                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | Required backend PostgreSQL URI; local Compose uses port 5435.                        |
| `JWT_SECRET`                         | Required, at least 32 characters; replace the example outside local development.      |
| `HOST`, `PORT`                       | Backend listener, defaults `0.0.0.0:3000`.                                            |
| `CORS_ORIGIN`                        | Exact permitted browser origin, defaults `http://localhost:5173`.                     |
| `NODE_ENV`                           | `development`, `test` or `production`; defaults to `development`.                     |
| `HTTP_WRITE_RATE_LIMIT_ENABLED`      | Literal `true`/`false`, default `false`.                                              |
| `WEBSOCKET_CONNECTION_LIMIT_ENABLED` | Literal `true`/`false`, default `false`, independent of HTTP limits.                  |
| `VITE_API_BASE_URL`                  | Public frontend API URL, defaults to `http://localhost:3000`; never put secrets here. |

The backend reads `.env` when `loadEnvironment()` runs. Restart it after changes.
Vite reads `apps/web/.env`; restart the dev server after changes and rebuild a
production frontend to change its embedded API URL.

## Start Database and Application

```bash
docker compose up -d --wait
corepack pnpm migration:up
corepack pnpm dev
```

Start the frontend in a second terminal from the same root:

```bash
corepack pnpm web:dev
```

Open `http://localhost:5173` and verify the API with:

```bash
curl http://localhost:3000/health
docker compose exec -T postgres psql -U newmessenger -d newmessenger -c 'SELECT 1'
```

Health returns `200` with `{ "status": "ok" }`; the SQL query separately checks
database readiness. The local database is PostgreSQL 17, exposed on port 5435.
Use `localhost` for Vite, which may bind IPv6. Reuse matching running services
instead of starting duplicates.

## Checks and Maintenance

| Command (prefix with `corepack pnpm`) | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `lint`, `format:check`                | Repository lint and read-only formatting checks.                               |
| `typecheck`, `web:typecheck`          | Backend/test and frontend types.                                               |
| `test`, `web:test`                    | Backend integration/unit and frontend suites.                                  |
| `build`, `web:build`                  | Backend and frontend production builds.                                        |
| `start`                               | Run the compiled backend after `build`; database/configuration still required. |
| `migration:create <name>`             | Create a migration for an approved schema change.                              |
| `format`                              | Rewrite formatting; use deliberately, not as a read-only check.                |

Start the local database and apply migrations before backend integration tests.
Some tests skip without local database configuration; inspect test counts and
skips rather than relying solely on the exit code. Choose checks relevant to the
change and follow [AGENTS.md](../../AGENTS.md) for delivery requirements.

`docker compose down` stops local PostgreSQL while retaining its volume. Do not
add `--volumes` unless you intend to delete that local data. Migration rollback
(`corepack pnpm migration:down`) changes schema/data and requires inspecting the
migration first; use the [production procedure](../deployment/production.md) for
release decisions, not local example credentials.

For feature QA, use the [verification guide](verification.md). If startup fails,
check Compose health, port conflicts, `.env` values and migration output first;
for browser failures check `CORS_ORIGIN` and `VITE_API_BASE_URL`. The repository's
`.vscode` settings recommend ESLint and Prettier but are not required to run it.
