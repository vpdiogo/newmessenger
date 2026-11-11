# Backup and Recovery

Run these owner-controlled steps after [deployment preparation](production.md).
Repository tests do not configure R2, send real Telegram messages or install VPS
units. Public activation requires a real off-VPS backup, alert test and isolated
restore rehearsal. Daily success targets at most 24 hours of data loss; a fully
offline VPS needs external detection, which this scheduled job does not provide.

## Configure

Use the release's `backup` image digest as `BACKUP_IMAGE` in `.env.production`.
Copy `.env.backup.example` to `.env.backup`, owned by `sysadmin`, mode `600`:

- Create a **private R2 Standard bucket** dedicated to this repository. Set its S3
  endpoint/bucket/prefix in `RESTIC_REPOSITORY` and use bucket-scoped read/write
  credentials. Set `AWS_DEFAULT_REGION=auto`. Check current account-wide pricing
  and billing limits; included usage is not an unconditional zero-cost guarantee.
- Generate `RESTIC_PASSWORD` independently with `openssl rand -hex 32`. Store the
  password, repository location, recovery credentials and release/config files
  securely **outside the VPS** as well as outside Git. Losing the password loses
  access to encrypted recovery data. Do not put secrets in issues or chat.
- Create a bot with [BotFather](https://t.me/BotFather), send it `/start`, and obtain
  your numeric chat ID using the private
  [getUpdates](https://core.telegram.org/bots/api#getupdates) response. Set
  `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`; keep credential-bearing API URLs out
  of command history/logs. Notifications go only to this configured destination.

Copy `infra/systemd/` from the same revision for later installation. The existing
PostgreSQL service must already be healthy. Use the deployment guide's `dc`
function, then run the guarded preparation:

```bash
dc --profile tools pull backup &&
  dc run --rm --no-deps backup init &&
  dc run --rm --no-deps backup test-alert &&
  dc run --rm --no-deps backup backup &&
  dc run --rm --no-deps backup status
```

`init` is explicit and only for a new repository; never initialize automatically
after a connection error. Existing repositories skip that step. Read the status,
confirm the real Telegram test arrived, and rehearse restoration before scheduling.

## Operation and Status

The temporary job uses the app's database role on the private database network,
plus a separate outbound network. It never mounts PostgreSQL data or joins ingress.
Its ceiling is 512 MiB/0.25 CPU; measure duration/memory before adjusting. A
PostgreSQL 17 custom dump is uploaded through Restic 0.19.1, then a full
`restic check --read-data` must succeed before retention runs. Dump files are private
and removed on completion/failure; a later locked run clears leftovers after an
abrupt host/container failure. `/state` belongs to the container's `postgres` user
(UID/GID 70); volume `newmessenger_backup-state` holds the lock/cache/status.

All commands share that volume's advisory lock. Concurrent attempts exit `75`
without touching snapshots or temporary files. CLI tools have a 30-minute timeout
per command; Telegram delivery has a 10-second timeout. Failures preserve the
original exit code, including when alert delivery also fails. JSON status/logs
contain stage, snapshot, timestamps and alert outcome, without raw tool errors,
connection strings or credential-bearing URLs.

```bash
dc run --rm --no-deps backup backup
dc run --rm --no-deps backup status
dc run --rm --no-deps backup snapshots
```

Status reports the last completed operation and last successful backup time. Read
it after the active job releases the lock. Retention keeps the union of **seven
daily and four weekly** calendar restore points, scoped to host `newmessenger`
and tag `newmessenger-postgres`; overlapping periods need not create 11 snapshots.
Snapshot timestamps/retention use UTC. Failed upload/verification never runs
expiration; retention/prune failures remain failed jobs even if a snapshot exists.

`repositoryDataBytes` comes from Restic's raw-data statistics, with an 8 GB warning
by default (`BACKUP_WARNING_BYTES`, positive and below 10 GB). It is a repository
data estimate, **not total R2 bucket/account billing telemetry**: metadata,
unreferenced objects, other storage and request counts need owner dashboard
checks. The reviewed Standard allowance is 10 GB-month, 1 million Class A and
10 million Class B requests/month, with free direct egress; verify current
[pricing](https://developers.cloudflare.com/r2/pricing/). Full verification reads
repository data and consumes requests. Retain headroom; investigate warnings or
failed pruning rather than assuming free capacity remains.

## Schedule on the VPS

The `sysadmin` account needs trusted Docker access and read access to both private
environment files; Docker access effectively grants host administration. No host
Node, pnpm, Restic or PostgreSQL installation is required. Review/edit the timer's
`OnCalendar` before installation: default **03:00 America/Sao_Paulo**, daily.
`Persistent=true` catches a missed activation when the host returns.

```bash
sudo install -o root -g root -m 644 infra/systemd/newmessenger-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload &&
  sudo systemctl start newmessenger-backup.service &&
  sudo systemctl enable --now newmessenger-backup.timer
systemctl list-timers newmessenger-backup.timer
systemctl status newmessenger-backup.service
journalctl -u newmessenger-backup.service --since today
```

The service never starts PostgreSQL implicitly. On timeout/stop, its cleanup stops
only the named backup job; it does not stop the database or other projects. A
failed service must be investigated in status/journal and Telegram; it is not a
successful backup. Disable scheduling with `sudo systemctl disable --now
newmessenger-backup.timer` before planned prolonged maintenance.

## Restore into an Isolated Empty Database

Select a **full 64-character snapshot ID** from `backup snapshots`; no implicit
`latest` or production destination is accepted. The `restore` service joins only
outbound and isolated `recovery` networks, targeting `restore-postgres` database
`newmessenger_restore`. Its volume `newmessenger_restore-data` is separate from
`newmessenger_postgres-data`. No production connection string is accepted.

```bash
dc --profile recovery up -d --wait restore-postgres &&
  dc run --rm -e RESTORE_SNAPSHOT=REPLACE_WITH_FULL_SNAPSHOT_ID \
    -e RESTORE_CONFIRM=newmessenger_restore restore
```

The tool checks application ownership of the snapshot, an empty destination,
manifest/database/version and dump digest. Restore is one transaction, without
`--clean` or automatic database creation. It then queries restored users,
messages and migration counts. Record recovery time and validate expected data
before considering any live recovery. Repeating into a nonempty rehearsal database
is refused. Application tests should also exercise login/history using only that
isolated database; never point the public application at it automatically.

Live recovery is a separate owner decision requiring compatible schema/application
versions and a plan for current writes. Do not restore an old snapshot over live
data. Keep production and the other application untouched. To discard **only the
rehearsal**, stop/remove `restore-postgres`, then explicitly remove
`newmessenger_restore-data`; never use a broad `down --volumes` or guessed volume.
