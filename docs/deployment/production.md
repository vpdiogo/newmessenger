# VPS Deployment

Deployment foundation for #82/#83. **Public activation waits for #84, including an
off-VPS backup and restore rehearsal.** This configuration does not establish live
hosting settings or publish images.

## Topology and Prerequisites

Run as `sysadmin` in `/srv/apps/newmessenger` on the shared amd64 VPS. Docker and
Compose are required; host Node/pnpm are not. Existing central Caddy in
`/srv/proxy/caddy` (project `reverse-proxy`) owns ports 80/443, TLS volumes and the
external `proxy` network. Preserve its Pocando ES routes and certificates.

`compose.production.yaml` defines project `newmessenger`: services `api`, `web`,
`postgres` and one-shot `migrate` (profile `tools`). Only API/web join `proxy`, as
`newmessenger-api:3000` and `newmessenger-web:8080`. PostgreSQL joins only internal
network `newmessenger_database`; volume `newmessenger_postgres-data` persists data.
No application ports are published. API/PostgreSQL/web ceilings are respectively
1 GiB/0.75 CPU, 1 GiB/0.50 CPU and 128 MiB/0.25 CPU; these are limits, not reservations.

Dockerfile bases are pinned by digest: Node 24.22.2, PostgreSQL 17.11 and Caddy
2.11.9; pnpm is 12.9.1. Update digests deliberately and rerun container QA.
The browser uses `https://newmessenger-app.duckdns.org/api`; sockets use `/ws` on
the same origin. Register/resolve that DuckDNS name before public TLS validation.

## Publish a Release

1. Check GitHub Actions/GHCR allowances and billing for the account, especially
   after making the repository private. Free usage is not unconditional.
2. Manually run **Publish verified images** from trusted workflow code, selecting
   a trusted commit, branch or tag and the public HTTPS API URL ending in `/api`.
   It resolves one SHA, runs repository checks, then builds Linux amd64 targets
   `api`, `web` and `migrate` from that SHA. It never connects to the VPS.
3. Require all three publish jobs to succeed. Save their digest references from
   the run summaries. Tags are `ghcr.io/vpdiogo/newmessenger-{api,web,migrate}:<sha>`;
   tags can be overwritten by a rerun, so deploy by digest. Keep the API URL
   consistent across the release. It is public build configuration, not a secret.
4. Check each package's visibility and repository Actions access. Private packages
   need package-read credentials on the VPS: a narrowly scoped GitHub credential
   with `read:packages`, package/account access and organization SSO if applicable.
   Supply it via `docker login ghcr.io --username <user> --password-stdin` from a
   secret manager/prompt; never paste tokens into commands or Git. Protect Docker
   credentials. Public packages permit anonymous pulls.

Only publishing gets `packages: write`; checkout credentials are not persisted.
Dispatching a revision executes its code: select only reviewed code.

## Prepare and Start

Copy files from the **same release revision** into `/srv/apps/newmessenger`:
`compose.production.yaml`, `.env.production.example`, `infra/docker/init-app.sql`
and `infra/caddy/newmessenger.caddy`. Preserve these relative paths. A private
repository requires separately authorized read access to obtain these files.
Keep `infra/docker/init-app.sql` readable by the database container (`chmod 644`).

Copy `.env.production.example` to `.env.production`, set mode `600`, and fill all
placeholders outside Git. Generate three independent secrets with
`openssl rand -hex 32`: database administrator password, app-role password and JWT
secret. Set all three image references to that release's digests. Keep
`CORS_ORIGIN=https://newmessenger-app.duckdns.org` and `PROXY_NETWORK=proxy`.
Do not reuse development credentials or expose database/JWT secrets to the web.

From that directory, use this prefix for every command:

```bash
dc() { docker compose --env-file .env.production -f compose.production.yaml "$@"; }
dc config --quiet &&
  dc --profile tools pull &&
  dc up -d --wait postgres &&
  dc run --rm migrate &&
  dc up -d --wait api web
```

Start with the new empty volume; no Supabase import or reset is needed. `migrate`
applies pending repository migrations using its migration lock/table and exits.
Stop on failure; do not start schema-dependent application images. It never runs
at API startup. An API healthcheck tests HTTP **and an authenticated SQL query**;
`/health` alone only proves the listener is up. Check migration success and a
functional API request separately before enabling ingress.

`APP_DB_USER` (default `newmessenger`) owns only the app database and can apply
migrations; the API does not use the `postgres` administrator. Initialization
variables/passwords apply only to an empty volume. Editing them later does not
rotate existing database credentials; plan any rotation explicitly.

## Integrate Central Caddy

Back up the current central Caddyfile. Review its actual Compose filename/service
and mount layout before editing: add only the site block from
`infra/caddy/newmessenger.caddy` (or import it from a mounted directory).
Do not replace shared configuration, recreate TLS volumes or change the other
application. Keep bind mounts pointing at the edited file; an atomic file
replacement can leave a single-file mount attached to its previous inode.

The snippet strips `/api` for HTTP, passes `/ws` directly to Fastify, and serves
other paths through the internal SPA Caddy. Validate the **mounted** central
configuration, then reload, using the existing Compose file/service names:

```bash
docker compose -p reverse-proxy -f /srv/proxy/caddy/compose.yaml exec -T caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -p reverse-proxy -f /srv/proxy/caddy/compose.yaml exec -T caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

If validation fails, do not reload. For ingress rollback restore the previous
mounted configuration, validate and reload again. Verify the existing
`pocandoes.com.br` route and `www` redirect before and after. DNS resolution,
reachable 80/443 and a valid public certificate are owner activation checks;
local HTTP/TLS rehearsal does not establish public certificate issuance.

## Verify, Update and Roll Back

After startup, verify `dc ps`, health, effective limits and absence of published
ports. Use two test accounts through HTTPS: registration/login, conversation
creation, realtime messages, same-ID retry, history after reconnect and reload of
a selected conversation URL. Check browser HTTPS/WSS and both applications' routes.
Feature scenarios are in the [verification guide](../development/verification.md).

For updates, retain the previous release's three digest references and matching
operator files securely. Read pending migrations and confirm the previous app
images remain compatible with the resulting schema **before proceeding**. A brief
New Messenger maintenance window is acceptable: stop API/web with `dc stop api web`,
update files and image references, then run the guarded sequence above.
Avoid changing project volume/network names. Never use `down --volumes`.

If a compatible application release fails, restore prior API/web digest references
and matching configuration, pull and recreate API/web. Preserve the database
volume and all new writes. Do not run migration-down automatically or restore an
old dump over live data. If the schema is incompatible, stop and plan recovery;
backup/restore procedures belong to #84.

### Activate or Disable Abuse Controls

Both enforcement switches in `.env.production` default off. After owner approval,
set `HTTP_WRITE_RATE_LIMIT_ENABLED=true` and/or
`WEBSOCKET_CONNECTION_LIMIT_ENABLED=true`, then `dc up -d --wait api` to recreate
with the new environment. Observe legitimate-use impact and aggregate rejection
logs; disable the affected switch and recreate API if needed. Restarts reset
instance-local accounting. Thresholds, limitations and deferred IP trust remain
in [API abuse protection](../architecture/api-abuse-protection.md). Do not enable
unconditional forwarded-header trust. Bounded container logs can still contain
existing application connection metadata; these controls are not DDoS protection.

## Interface for Backup/Recovery (#84)

Reuse project `newmessenger`, service `postgres`, internal `database` network and
volume `postgres-data` above. Operator configuration is `.env.production`:
`POSTGRES_DB`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`,
`JWT_SECRET` and the three release image references. Discover the database with
Compose service commands, never another project's container name. Keep credentials
and release/config recovery material outside Git. No R2, Restic, schedule or
Telegram runtime is installed by this foundation.

## Previous Hosting

The previous topology was Vercel → Render → Supabase PostgreSQL, with recorded
URLs `https://newmessenger-sigma.vercel.app` and
`https://newmessenger-api.onrender.com`. This is historical configuration, not a
live availability check. `render.yaml` remains for the existing service; this PR
does not shut providers down, migrate their data or alter their live settings.
