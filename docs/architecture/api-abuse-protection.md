# API Abuse Protection

Issue: [#41](https://github.com/vpdiogo/newmessenger/issues/41).
Baseline: `daa14d1`, including PRs #65, #66 and #69.
Status: proposed single-instance decision; Render client-IP policy is unresolved.

This document specifies future controls for #43 and #44. They are not implemented
or enabled by this documentation change. Production rollout requires owner
approval and the proxy evidence described below.

## Threat Model and Enforcement Points

Protect legitimate account creation, login, conversation writes and realtime
delivery from repeated application-level requests. Inputs, claimed email
addresses and forwarding headers are untrusted. A valid JWT identifies an
authenticated caller; it does not make that caller's request volume harmless.

| Abuse                                                | Existing control                                                           | Expensive work still reachable        | Proposed enforcement point                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Automated registration and repeated duplicate emails | Field validation, unique email                                             | Argon2 hash and user insert           | IP quota before body parsing; validated-email quota before hashing         |
| Repeated credential guesses                          | Field validation, Argon2 verification, generic invalid-credential response | User lookup and password verification | IP quota before parsing; email failure budget before lookup/verification   |
| Repeated direct-conversation creation                | JWT, participant lookup, unique user pair                                  | User lookup and transaction           | Authenticated-user quota after JWT verification, before database work      |
| Message spam and repeated retries                    | JWT, membership, 2,000-character validation, client-ID idempotency         | Membership checks, insert and fan-out | IP quota before parsing; authenticated-user quota before database work     |
| Excessive WebSocket attempts                         | JWT checked after upgrade                                                  | Upgrade and connection allocation     | IP attempt quota before upgrade, including unauthenticated attempts        |
| Too many sockets for one account                     | Local socket registry                                                      | Retained sockets and fan-out work     | Occupancy admission after JWT verification, before registration/acceptance |
| Oversized JSON bodies                                | Fastify's default body limit; route payload validation                     | Body parsing and memory allocation    | Explicit 32 KiB body limit before route handling                           |

The source boundaries are `src/modules/auth/routes.ts`,
`src/modules/conversations/routes.ts`, `src/modules/messages/routes.ts`, and
`src/modules/realtime/routes.ts`. HTTP writes remain authoritative; messages
must still persist before `message.created` delivery. CORS is not an abuse
control for non-browser clients.

## Client-IP Trust: Default and Approval Gate

### Direct connections and local tests

Keep `TRUST_PROXY=false` by default. Use the connection peer as the IP key and
ignore `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP`, and `True-Client-IP`
when the sender is not explicitly trusted. Validate and canonicalize IPs so
IPv4-mapped IPv6 and equivalent IPv6 spellings do not create separate counters.
Do not use an invalid or missing IP as a fresh random key that bypasses quotas.

### What is known about Render

The repository declares a Free Render web service. Render documents public
forwarding to a port that is not directly reachable from the public internet,
and describes Cloudflare/load-balancer forwarding with `X-Forwarded-For`.
Render also documents private-network access for eligible service plans, while
Free web services cannot receive private-network requests. These facts describe
the provider model, not a verified snapshot of this deployment's actual plan,
ingress paths or header sanitization.

The reviewed public documentation does not establish a sufficiently precise
spoof-resistant header/peer policy for this service. A sample request, a private
source address, the presence of `CF-Ray`, or Render's **outbound** IP ranges does
not establish a trusted inbound proxy. Do not select the first forwarded value,
trust all proxies, guess a hop count, or trust all private-network addresses.

### Evidence needed before enabling trusted metadata

Obtain provider documentation or written confirmation covering:

1. Public and private ingress paths for the actual plan, including custom
   domains, future proxies and possible origin access that bypasses the edge.
2. The canonical client-IP metadata, whether it replaces or appends caller
   values, and behavior for forged, duplicate, missing and malformed headers.
3. How to authenticate the immediate proxy boundary: maintained inbound
   addresses/ranges, or an equivalent documented provider guarantee that applies
   to every accepted path. Outbound ranges are not a substitute.
4. IPv4/IPv6 behavior and the conditions under which these guarantees change.

The owner can send these four questions to Render support. This increment does
not contact the provider or deploy a diagnostic endpoint that exposes headers.

Once proven, record the exact Fastify mapping here. A validated IP/CIDR allowlist
maps to `trustProxy: [approved ranges]`; default false maps to `trustProxy: false`.
Enabling the proposed `TRUST_PROXY` flag must never map to unconditional
`trustProxy: true`. A flag alone is not a specification of trusted ranges. If
Render instead guarantees a sanitized canonical header across isolated ingress,
document and approve that alternative and its implementation mapping before
changing #43. Neither alternative is approved for this deployment yet.

With an approved forwarding policy, canonicalize the selected address and reject
missing, malformed or ambiguous required metadata on protected write/handshake
routes before expensive work; specify the exact validation response with the
chosen policy. An untrusted peer's forwarded values are ignored, not traversed.

Do not enable the strict IP quotas in Render while all callers would share a
load balancer's address. That would throttle legitimate users collectively.
Keep #43 `needs-design` and #44 `blocked` until this gate is resolved. The absence
of proven IP extraction does not authorize silently dropping an IP quota or
claiming that current production is protected.

## Initial Quotas and Accounting

These are the proposed initial values from #43/#44, subject to owner approval
of their usability risks. Counters are local to one Fastify instance.

| Operation           | Key and limit                                                                   | Accounting                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register            | 5/IP/hour; 3/validated lowercase email/24 hours                                 | Count IP attempts before parsing; count valid credential submissions by email before hashing, including later duplicate-email conflicts                              |
| Login               | 20/IP/15 minutes; 5 failed authentications/validated lowercase email/15 minutes | Count IP attempts; count invalid-credential outcomes for existing and nonexistent emails identically; successful authentication does not increment the failure count |
| Create conversation | 20/authenticated user/hour                                                      | Count authenticated attempts, including reopening an existing pair                                                                                                   |
| Create message      | 120/IP/minute; 60/authenticated user/minute                                     | Count attempts, including unchanged idempotent retries; rejection precedes persistence and fan-out                                                                   |
| WebSocket handshake | 30/IP/minute                                                                    | Count attempts before upgrade, including unauthenticated and occupancy-rejected attempts                                                                             |
| Live WebSockets     | 5/authenticated user                                                            | Count accepted sockets; release occupancy exactly once on close/error/shutdown                                                                                       |

Use the existing validated lowercase email identity, without provider-specific
alias rules or password trimming. Invalid credential bodies receive existing
validation errors and consume only an applicable early IP attempt. Authenticating
a JWT must precede user-keyed admission. Invalid JWTs keep their existing
unauthorized behavior when not already rejected by an early IP quota.

Email failure budgets need bounded temporary reservations before asynchronous
lookup/verification, so concurrent requests cannot all pass an exhausted budget.
Convert a reservation to a failure only for an invalid-credential outcome;
release it on successful authentication or a server failure. A reservation is
not a permanently counted failed login. Define and test cleanup exactly once.
Window expiry resets expired failure counts, but does not release reservations
while their lookup/Argon2 work remains in flight. Keep those reservations charged
against per-email admission capacity and the bounded retained-state ceiling until
the underlying work settles; a response timeout alone does not cancel that work.
Bind each reservation to its originating window generation. A late completion
must not charge a replacement window, resurrect an expired counter or refund a
different request's reservation.
At exhaustion, reject before lookup/Argon2; do not check unlimited candidate
passwords merely to decide whether to return `429`.

Each exhausted applicable quota rejects the attempt. Earlier admitted attempt
counters are not refunded when a later quota rejects it. Socket close releases
occupancy but never refunds a handshake attempt. Test simultaneous occupancy
admission without awaiting between the capacity check and slot registration;
a rejected sixth socket never occupies a slot or receives `connection.accepted`.

### Usability and Security Trade-offs

Shared networks consume one IP budget. An attacker can consume another person's
email budget: the login budget temporarily throttles even correct credentials
until expiry, and the registration email budget can delay that person's signup.
These are identifier-based throttles, not persistent account lockout or password
changes, but their availability impact must be approved explicitly. Do not
present the email quota as a complete credential-stuffing defense.

Distributed attackers, changing IPs, IPv6 address rotation and multiple accounts
can reduce these controls' effectiveness. No IPv6 subnet aggregation is selected
without another documented decision. Fixed windows allow boundary bursts; these
values are initial limits, not demonstrated optimal thresholds.

## Bounded Local State

Use one small application-owned fixed-window limiter, shared by route-specific
quota namespaces. A counter expires after its configured duration from its first
admitted attempt; blocked requests do not extend expiry. Inject a monotonic clock
for deterministic expiry tests. Keep occupancy separate from attempt counters.

Propose a hard ceiling of 10,000 retained entries across quota counters and login
reservation records, shared by all namespaces.
Validate/key-limit untrusted inputs before retention. Use bounded expiry cleanup,
check expired entries before inserting, and never evict an active budget to admit
an attacker-selected fresh key. In-flight login records are not expired to
manufacture free capacity: stop new admission at the ceiling and release settled
work exactly once. Cleanup is disposed on application shutdown.

If no expired entry can free capacity, reject quota-controlled work before its
expensive step with `503`, `Cache-Control: no-store`, a bounded `Retry-After`, and
`{ "message": "Service temporarily unavailable" }`. Reserve `429` for a
known exhausted quota, rather than silently allowing untracked work. The exact
cleanup strategy/capacity must be checked in #43; changing these proposed values
requires recording the reason and keeping the bound enforceable.

Retain only counters, expiry and bounded reservation metadata. Use process-local
HMAC keys for email/IP counter identifiers rather than raw sensitive strings;
never log keys or reuse the JWT secret for this purpose. Restarts reset budgets;
multiple instances multiply them. Distributed enforcement is a separate scaling
decision, not a claim made by Redis event fan-out in #17.

## Response, Recovery and Logging

Quota exhaustion returns the existing planned contract:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: <positive integer seconds>
Cache-Control: no-store
Content-Type: application/json

{ "message": "Too many requests" }
```

Reject immediately at an exhausted early gate without parsing credentials or
verifying a JWT merely to discover another budget. If several already evaluated
budgets are exhausted at the same gate, use the longest remaining wait among
those budgets; an early IP-only rejection uses that IP budget's wait.
Reject bodies exceeding 32 KiB with `413`; preserve the existing 2,000-character
message rule independently. GET `/health`, `/auth/me`, conversation lists and
both history directions are outside these write quotas. Existing success,
unauthorized, membership and idempotent-retry contracts remain unchanged.

The current frontend retains a message's client ID after `429` and handles
temporary session-verification failures, but it does not expose `Retry-After`
through `ApiError`. Login/signup still show generic transient feedback.
Record browser observations; do not claim a countdown or header-aware retry UX
exists or implement that UI inside #43/#44. No automatic outgoing retry is added.

The browser retries WebSockets every second. One denied sixth tab can exhaust a
shared handshake budget after repeated reconnects, also delaying replacement
connections. Test this interaction and disclose it before #44 rollout. Pre-upgrade
HTTP rejection and post-upgrade `1008` occupancy rejection retain distinct
semantics. Backoff/stop-on-policy behavior requires separate owner-approved client
scope; recovery GETs, discovery and announcements must remain compatible.

Log only the route template, rejection category, key type, retry duration and
request correlation ID. Avoid raw IP/email, headers, credentials, tokens and
message content in rejection records. Fastify currently logs the peer address
automatically: privacy verification must include automatic request/error logs
for rejected traffic, not just a new custom limiter log. Do not add unbounded
per-key metrics or a monitoring dependency; use aggregate rejection categories
and existing resource/request metrics to evaluate shared-IP impact and saturation.

Provider edge protection addresses a different class of volumetric attacks.
These controls reduce application work after traffic reaches Fastify; they are
not a complete DDoS defense. No paid WAF, CAPTCHA or provider-setting change is
selected by this decision.

## Verification and Delivery Gates

| Check                | Required evidence                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IP policy            | Local direct-peer and approved-proxy fixtures; forged/prepended/duplicate/missing/malformed headers; IPv4/IPv6 normalization; changing an untrusted header cannot change the key                                                 |
| Early rejection      | Spy/assert that rejected registration/login avoids hashing/lookup; rejected writes avoid queries/persistence/fan-out; exhausted handshakes avoid upgrade                                                                         |
| Counters             | Exact limits, independent keys/namespaces, expiry, unchanged windows on rejection, bounded retention/saturation, concurrent reservation cleanup and stale completions after window rollover while earlier work remains in flight |
| Socket occupancy     | Sixth-connection rejection, independent users, concurrent admission, replacement, idempotent close/error/shutdown cleanup                                                                                                        |
| Compatibility        | Registration/login, membership, duplicate conversations, lost-response message retry, chronological backward/forward pages, reconnect discovery/recovery and announcements                                                       |
| Real TCP/browser QA  | Controlled local limit exhaustion and cooldown, preserved client IDs, multi-tab reconnect behavior, accurate labeling of simulated failures; no production load test                                                             |
| Operational evidence | Owner-confirmed service plan/ingress, spoof-resistance guarantee, manual pre-enable checks and rollback to the previous release                                                                                                  |

Delivery order: #41 records and reviews the decision; #43 implements approved
HTTP controls and shared primitives only after the proxy/risk gates are resolved;
#44 follows the merged #43 and owner readiness approval. Neither issue becomes
`agent-ready` automatically. Use existing issues rather than creating additional
ones without owner authorization. Production changes remain an owner action.

This design increment checks source paths, references and documentation format;
the matrix above describes future implementation verification. It does not claim
the unimplemented limiter or Render spoof resistance was tested.

## Sources and Remaining Provider Questions

Reviewed on 2026-10-10:

- [Fastify proxy trust](https://fastify.dev/docs/latest/Reference/Server/#trustproxy): explicit trust configuration; installed source in `node_modules/fastify/lib/request.js` also reviewed.
- [Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/): pre-parsing and post-authentication enforcement locations.
- [Fastify WebSocket hooks](https://github.com/fastify/fastify-websocket#using-hooks): request hooks before upgrade.
- [Render web services](https://render.com/docs/web-services#port-binding): public port forwarding and ingress.
- [Render private network](https://render.com/docs/private-network): plan-dependent private access.
- [Render DDoS guidance](https://render.com/articles/how-render-handles-ddos-attacks): edge/application boundaries and forwarded IP guidance.
- [Render outbound addresses](https://render.com/docs/outbound-ip-addresses): outbound ranges are not inbound proxy identity.

The unresolved provider questions are the four items in the client-IP evidence
section. The source guidance is not approval of a particular Render header or
proxy allowlist; no provider guarantee or runtime setting is inferred here.
