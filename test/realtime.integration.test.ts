import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { test } from "node:test";
import type WebSocket from "ws";

import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";

const canRunRealtimeTest = Boolean(
  process.env.DATABASE_URL || existsSync(".env"),
);

function nextMessageCreated(socket: WebSocket) {
  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for message.created"));
    }, 1000);
    const onMessage = (payload: Buffer) => {
      const event = JSON.parse(payload.toString()) as { type: string };
      if (event.type !== "message.created") return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(event);
    };
    socket.on("message", onMessage);
  });
}

test(
  "persisted messages are delivered to connected conversation members",
  { skip: !canRunRealtimeTest },
  async () => {
    const environment = loadEnvironment();
    const app = await buildApp({
      databaseUrl: environment.DATABASE_URL,
      jwtSecret: environment.JWT_SECRET,
    });
    const sender = {
      email: `sender-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const recipient = {
      email: `recipient-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const senderToken = app.jwt.sign({ sub: sender.id, email: sender.email });
    const recipientToken = app.jwt.sign({
      sub: recipient.id,
      email: recipient.email,
    });

    let conversationId: string | undefined;
    let recipientSocket: Awaited<ReturnType<typeof app.injectWS>> | undefined;
    try {
      await app.postgres.query(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, $3), ($4, $5, $6)`,
        [
          sender.id,
          sender.email,
          "unused",
          recipient.id,
          recipient.email,
          "unused",
        ],
      );
      const conversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${senderToken}` },
        payload: { participantId: recipient.id },
      });
      conversationId = conversation.json().id;

      recipientSocket = await app.injectWS("/ws", {
        headers: { "sec-websocket-protocol": `bearer, ${recipientToken}` },
      });
      const messageEvent = nextMessageCreated(recipientSocket);

      const createdMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${senderToken}` },
        payload: { content: "Delivered over WebSocket" },
      });
      assert.equal(createdMessage.statusCode, 201);

      assert.deepEqual(await messageEvent, {
        type: "message.created",
        data: createdMessage.json(),
      });
    } finally {
      recipientSocket?.terminate();
      if (conversationId) {
        await app.postgres.query("DELETE FROM conversations WHERE id = $1", [
          conversationId,
        ]);
      }
      await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [sender.id, recipient.id],
      ]);
      await app.close();
    }
  },
);
