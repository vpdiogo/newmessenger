# API and Client Contracts

Use this reference for existing HTTP/WebSocket behavior and client recovery.
Examples assume the local API at `http://localhost:3000`; replace placeholders
with temporary local credentials/IDs. Do not paste real tokens into shared logs.

## Endpoints

Authenticated HTTP requests use `Authorization: Bearer <accessToken>`.

| Method/path                                    | Authentication               | Result                                                                                  |
| ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `GET /health`                                  | None                         | `200 { "status": "ok" }`; does not query PostgreSQL.                                    |
| `POST /auth/register`                          | None                         | `201 { "accessToken": "..." }`; invalid input `400`, duplicate email `409`.             |
| `POST /auth/login`                             | None                         | `200 { "accessToken": "..." }`; invalid input `400`, incorrect credentials `401`.       |
| `GET /auth/me`                                 | JWT                          | Verified token claims, including `sub` and `email`; invalid/expired token `401`.        |
| `POST /conversations`                          | JWT                          | `{ "id": "..." }`, `201` new pair or `200` existing pair; unknown participant `404`.    |
| `GET /conversations`                           | JWT                          | Array of `{ id, createdAt, participant: { id, email } }`, newest-created first.         |
| `POST /conversations/:conversationId/messages` | JWT + membership             | Stored message, `201` new or `200` idempotent retry; unavailable conversation `404`.    |
| `GET /conversations/:conversationId/messages`  | JWT + membership             | `{ messages, nextCursor }`; invalid query/cursor `400`, unavailable conversation `404`. |
| `GET /ws`                                      | Bearer WebSocket subprotocol | Server events; see below.                                                               |

Quota/body/capacity failures additionally follow [API abuse protection](api-abuse-protection.md).

## Credentials and Session

Registration accepts `{ "email": "user@example.com", "password": "..." }`.
Passwords must have 15–256 Unicode code points, must not be whitespace-only,
and must not contain the complete email case-insensitively. Unique long passwords
or several unrelated words are recommended; character categories are not required.
Spaces, accents and symbols are accepted. Passwords are never trimmed or
Unicode-normalized. Login retains its existing 12–256-code-point validation for
legacy accounts. Emails are validated and stored lowercase.

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"correct-horse-battery-staple"}'
```

Registration errors retain the `message` field and may add `fieldErrors`:
`invalid_email`/`email_registered` on email, and
`password_length`/`password_blank`/`password_contains_email` on password. The web
client maps known codes to field feedback and safely falls back for unknown or
legacy responses. Editing email clears duplicate feedback; editing password alone
does not. Email-in-password feedback is reevaluated when either field changes.

JWT access tokens expire after 15 minutes. `/auth/me` verifies claims; it does not
prove email ownership or provide token revocation/live-profile lookup. The browser
stores the token locally and gates `/app` on verification. A verification `401`
clears the token; temporary failures keep it and require **Retry**. There is no
refresh-token flow. Login feedback does not distinguish unknown emails from wrong
passwords. Auth forms lock while submitting and preserve values on failure.

## Conversations and Messages

Create a pair with exactly one of `participantEmail` or legacy `participantId`:

```bash
curl -X POST http://localhost:3000/conversations \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{"participantEmail":"person@example.com"}'
```

The browser stores selection in `/app?conversation=<id>` and resolves it against
the user's returned list. Invalid IDs fall back to the first conversation; an
empty list clears selection. Back/Forward work, unrelated query/hash values are
retained, and an initial list failure preserves the requested URL for retry.
Refresh/discovery preserves a valid selection, draft and transcript. Incoming
events for unknown conversations and socket opens refresh the list; a remotely
created conversation without a message requires manual **Refresh** while connected.

```bash
curl -X POST 'http://localhost:3000/conversations/<conversation-id>/messages' \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{"clientMessageId":"<uuid>","content":"Hello"}'
```

A message has `id`, `conversationId`, `senderId`, `clientMessageId`, `content` and
`createdAt`. The sender/client ID pair is the idempotency key: reusing it returns
the original stored message without another insert or event. Reusing an ID is
not an edit operation. Membership and payload validation still precede retry
lookup. Content is trimmed and the API accepts 1–2,000 Unicode code points.
The current composer instead counts UTF-16 units; supplementary characters such
as emoji therefore reach its 2,000 limit sooner. This discrepancy is a pending
code correction, not an API policy change in this documentation.

Enter sends, Shift+Enter inserts a newline; IME composition, held key repeats,
loading/pending states and invalid drafts prevent sending. Unconfirmed transient
failures retain the client ID for an unchanged manual retry. Editing failed text
starts a new logical message with a new ID and cannot cancel a prior server
acceptance. No outgoing resend occurs automatically. Switching conversations
currently clears draft and pending-send recovery context; #58 proposes retention.

## History and Realtime Recovery

History accepts `limit` (1–100, default 50), optional message-ID `cursor` and
`direction` (`forward` by default):

```bash
curl 'http://localhost:3000/conversations/<conversation-id>/messages?limit=50&direction=backward' \
  -H 'authorization: Bearer <accessToken>'
```

Forward starts at the oldest page without a cursor; `nextCursor` advances toward
newer messages. Backward starts at the latest page and its next cursor loads
earlier messages. Both return each page chronologically by `(created_at, id)`;
`nextCursor` is `null` at the end. Timestamps are UTC ISO strings retaining
PostgreSQL microseconds. Deploy support for a query/contract before releasing a
client that requires it; existing forward-history clients remain compatible.

WebSockets authenticate using protocols `["bearer", accessToken]`:

```js
const socket = new WebSocket("ws://localhost:3000/ws", [
  "bearer",
  "<accessToken>",
]);
socket.addEventListener("message", (event) => console.log(event.data));
```

Events are `{ "type": "connection.accepted" }` and
`{ "type": "message.created", "data": <message> }`. Sending messages remains HTTP.
Persisted history is authoritative; events are best effort and local to one
instance. Reconnect/open invokes list discovery and forward history recovery from
the last HTTP history cursor. ID-based merging prevents duplicates; timestamps
and IDs preserve ordering. The UI initially loads recent history and exposes
**Load earlier messages**. Earlier pages preserve the reading anchor; incoming
messages follow the end only when the reader is near it.

Capacity closes `4008` stop automatic retry and expose **Try again**. Ordinary
closes retry after one second; this currently includes authentication `1008`
closes. Admission checks JWT expiry, but existing sockets do not revalidate it.
The browser marks connected on `open`; a subsequent refusal can briefly show
connected and run HTTP recovery. See [abuse controls](api-abuse-protection.md)
for exact limits, close reasons and the independent default-off switches.

The selected conversation has `aria-current`; its heading names the conversation
region. Polite live regions announce novel incoming messages in the selected
conversation and connection changes without moving focus. Initial/earlier history,
own messages and other conversations remain silent. Recovery announcements are
deduplicated by message ID; selection change/disposal cancels pending content.
These are accessibility announcements, not presence or browser notifications.
