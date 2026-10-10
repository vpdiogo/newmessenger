# API Abuse Protection

## Implemented HTTP stage — #43

A per-application fixed-window limiter protects two authenticated writes when
`HTTP_WRITE_RATE_LIMIT_ENABLED=true` (default: `false`):

| Route                                          | Budget per authenticated user |
| ---------------------------------------------- | ----------------------------- |
| `POST /conversations`                          | 20 attempts/hour              |
| `POST /conversations/:conversationId/messages` | 60 attempts/minute            |

JWT verification precedes admission, which precedes route validation and database
work. Keys use the verified lowercase user ID and independent route namespaces.
Existing-pair creation, unchanged message retries and later validation/membership
failures consume attempts. Invalid JWTs do not allocate counters. Rejections
perform no database work, persistence or fan-out. GET recovery/discovery/history,
registration/login and WebSockets are outside these quotas.

Windows start at the first admitted attempt. Rejections do not extend them.
Admission is synchronous and uses an injectable monotonic clock. The limiter
retains at most 10,000 entries across both namespaces. Each attempt examines at
most 128 entries through a persistent cleanup cursor and also expires its own
key. Live budgets are never evicted to admit new identities. Cleanup is lazy,
so capacity rejection can persist until later attempts sweep expired entries;
there is no timer. State is cleared on application close. Restarts reset budgets;
multiple instances multiply them. No distributed enforcement is claimed.

Quota rejection returns `429`, `Retry-After` as positive integer seconds until
expiry, `Cache-Control: no-store`, and `{ "message": "Too many requests" }`.
State saturation returns `503`, `Retry-After: 1`, the same cache directive, and
`{ "message": "Service temporarily unavailable" }`. That one-second wait is
advisory, not a guarantee that capacity will be available.

An independent global **32 KiB body limit** remains active with the switch off.
Fastify rejects oversized JSON with `413` before route handling. The separate
2,000-trimmed-character message rule remains unchanged. Persisted messages remain
idempotent by sender/client ID: retrying the original ID after cooldown returns
the original message without another insert or event.

## Activation and rollback

The owner enables the switch only after local enabled/disabled QA. Set
`HTTP_WRITE_RATE_LIMIT_ENABLED=true` in the hosting environment and apply its
restart/redeploy procedure. Only literal `true` and `false` are accepted.
Implementation does not mutate production or provider settings.

Observe aggregate `429`/`503` counts, legitimate-user complaints and existing
resource/request metrics. Rejection logs contain route template, category
(`quota`/`capacity`), key type and retry duration, with the existing request
correlation ID. They add no user IDs, IPs, emails, headers, tokens or message
content. Existing Fastify request logging still includes connection metadata;
this change does not redesign global log privacy or add per-user metrics.

If legitimate use is unduly blocked, set the switch to `false` and restart or
redeploy. This bypasses quota/capacity checks while retaining the body limit.
The existing release rollback remains available. The frontend already preserves
failed message text and client ID after `429`; it offers manual retry, without a
Retry-After countdown or automatic outgoing resend.

## Deferred controls and Render research

[#43](https://github.com/vpdiogo/newmessenger/issues/43) records the approved HTTP
scope and tracks deferred IP interpretation, platform adapter, IP quotas and
email budgets. [#44](https://github.com/vpdiogo/newmessenger/issues/44) plans the
separate per-user WebSocket occupancy control and manual recovery. Neither
WebSocket limits nor auth-volume limits are implemented by this HTTP stage.
The earlier broader [#41](https://github.com/vpdiogo/newmessenger/issues/41)
proposal is superseded for this stage; its proxy approval gate applies only to
future IP enforcement, not authenticated-user quotas.

Render recommends `X-Forwarded-For`, but the reviewed documentation does not
establish a sufficiently precise caller-header overwrite/append policy for this
service. No forwarding probe or provider support exchange has occurred. Keep
Fastify's existing default proxy distrust. Do not guess a hop count, trust all
proxies/private addresses, or use outbound ranges as inbound proxy identity.
No `TRUST_PROXY` flag or premature platform adapter is added.

Before implementing IP quotas, establish actual public/private ingress paths,
canonical metadata and forged/duplicate/missing-header behavior, an authenticated
proxy boundary, and IPv4/IPv6 behavior. Then approve a concrete provider policy
and small adapter separately. A diagnostic deployment is optional future work.
Shared-IP throttling and targeted-email budget exhaustion require explicit
usability decisions before choosing auth/IP/email thresholds. Historical proposed
thresholds are not approved or enforced by this stage.

Supporting research, reviewed 2026-10-10:

- [Fastify findings and provider questions](https://github.com/vpdiogo/newmessenger/issues/43#issuecomment-6099231824)
- [Render documentation findings](https://github.com/vpdiogo/newmessenger/issues/43#issuecomment-6099232490)
- [Proportional portfolio approach](https://github.com/vpdiogo/newmessenger/issues/43#issuecomment-6099233146)
- [Activation and monitoring discussion](https://github.com/vpdiogo/newmessenger/issues/43#issuecomment-6099446680)

These controls reduce application work after traffic reaches Fastify. They are
not complete DDoS protection; provider edge controls address volumetric traffic.
