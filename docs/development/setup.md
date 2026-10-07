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

## Verify the Toolchain

```bash
pnpm exec tsx --version
pnpm exec tsc6 --version
pnpm web:typecheck
pnpm web:build
```
