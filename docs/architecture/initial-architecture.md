# Initial Architecture

## Goal

Build the smallest reliable real-time messenger for learning the Node.js ecosystem and system design fundamentals.

The first increment supports authenticated one-to-one text messaging. Messages are persisted and delivered in real time when the recipient is connected.

## System Context

```text
Client A ─┐
          ├── HTTP and WebSocket ──> Node.js application ──> PostgreSQL
Client B ─┘                                  │
                                             └── connected sockets in memory
```

The application is a single deployable modular monolith built with Fastify and `@fastify/websocket`. It owns the HTTP API, WebSocket connections, authentication, message persistence, and real-time delivery.

There is one application instance in the initial architecture.

## Components

### Node.js Application

- Exposes HTTP endpoints for authentication and message history.
- Exposes a WebSocket endpoint for real-time events.
- Authenticates WebSocket connections using a JWT.
- Validates all HTTP and WebSocket input.
- Persists messages before reporting successful acceptance to the sender.
- Keeps a `Map<userId, Set<WebSocket>>` of connected client devices.
- Delivers a persisted message immediately to each connected recipient socket.

### PostgreSQL

PostgreSQL is the source of truth for users, conversations, members, and messages. A client reconnecting after an offline period recovers messages through the HTTP history endpoint.

### Clients

Clients use HTTP for request-response operations and WebSocket for server-initiated real-time events. They must tolerate duplicate events and reconnect safely.

## Message Flow

```text
1. Client A opens a WebSocket connection and authenticates.
2. Client A sends `message.send` with a client-generated request ID.
3. The application validates authentication, membership, and payload.
4. The application stores the message in PostgreSQL.
5. The application replies to Client A with `message.accepted`.
6. If Client B has active sockets, the application emits `message.created` to them.
7. If Client B is offline, the message remains available through message history after reconnection.
```

Persisting before delivery is mandatory. WebSocket delivery is best-effort; PostgreSQL provides recovery after a failed connection or application restart.

## Data Model

```text
users
  id, name

conversations
  id, created_at

conversation_members
  conversation_id, user_id

messages
  id, conversation_id, sender_id, client_message_id, content, created_at
```

Required constraints and indexes:

- `UNIQUE(sender_id, client_message_id)` prevents duplicate sends after client retries.
- An index on `(conversation_id, created_at DESC)` supports cursor-based message history.
- Conversation membership is checked before reading or sending messages.

## WebSocket Contract

Event names and payloads are versioned through explicit message types. The initial events are:

```text
Client -> Server: message.send
Server -> Client: message.accepted
Server -> Client: message.created
```

Each `message.send` includes a client-generated `requestId`. Retrying the same request must not create another message.

## Explicit Non-Goals

The initial architecture does not include:

- Multiple application instances or a dedicated WebSocket gateway.
- Redis, queues, background workers, or webhooks.
- Groups, delivery/read receipts, typing indicators, or presence.
- Attachments, push notifications, search, or end-to-end encryption.
- Event brokers or microservices.

## Evolution Triggers

Introduce a component only when its problem exists:

| Trigger                                                                | Next addition                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Multiple application instances                                         | Redis for cross-instance socket event distribution and connection coordination. |
| Slow or retryable work such as push notifications and media processing | A queue and background worker.                                                  |
| External server-to-server integrations                                 | Transactional outbox and signed webhooks.                                       |
| Large binary attachments                                               | S3-compatible object storage.                                                   |
| Proven search requirements                                             | A dedicated search index.                                                       |

## Architectural Review Checklist

Before accepting an increment, verify:

- Does it solve a current requirement with the smallest practical design?
- Does the modular monolith remain the right boundary?
- Is durable state stored in PostgreSQL rather than process memory?
- Is untrusted input validated at the HTTP or WebSocket boundary?
- Does the change have a focused, meaningful test?
