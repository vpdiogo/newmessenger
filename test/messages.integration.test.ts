import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";

const canRunMessageTest = Boolean(
  process.env.DATABASE_URL || existsSync(".env"),
);

test(
  "latest and earlier history preserve forward recovery and tied timestamp ordering",
  { skip: !canRunMessageTest },
  async () => {
    const environment = loadEnvironment();
    const app = await buildApp({
      databaseUrl: environment.DATABASE_URL,
      jwtSecret: environment.JWT_SECRET,
    });
    const userIds = [randomUUID(), randomUUID(), randomUUID()];
    const conversationId = randomUUID();
    const prefix = randomUUID().slice(0, 24);
    const ids = Array.from(
      { length: 65 },
      (_, index) => `${prefix}${String(index + 1).padStart(12, "0")}`,
    );
    const token = app.jwt.sign({
      sub: userIds[0],
      email: "history@example.test",
    });
    const headers = { authorization: `Bearer ${token}` };
    try {
      await app.postgres.query(
        "INSERT INTO users (id, email, password_hash) SELECT id, id::text || '@example.test', 'unused' FROM unnest($1::uuid[]) AS id",
        [userIds],
      );
      await app.postgres.query("INSERT INTO conversations (id) VALUES ($1)", [
        conversationId,
      ]);
      await app.postgres.query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
        [conversationId, userIds[0], userIds[1]],
      );
      await app.postgres.query(
        `INSERT INTO messages (id, conversation_id, sender_id, client_message_id, content, created_at)
       SELECT id, $2, $3, id, id::text, '2026-10-08T12:00:00Z'::timestamptz FROM unnest($1::uuid[]) AS id`,
        [ids, conversationId, userIds[0]],
      );
      const path = `/conversations/${conversationId}/messages`;
      const latest = await app.inject({
        method: "GET",
        url: `${path}?direction=backward`,
        headers,
      });
      assert.equal(latest.statusCode, 200);
      assert.deepEqual(
        latest.json().messages.map((item: { id: string }) => item.id),
        ids.slice(15),
      );
      assert.equal(latest.json().nextCursor, ids[15]);
      const earlier = await app.inject({
        method: "GET",
        url: `${path}?direction=backward&cursor=${latest.json().nextCursor}`,
        headers,
      });
      assert.deepEqual(
        earlier.json().messages.map((item: { id: string }) => item.id),
        ids.slice(0, 15),
      );
      assert.equal(earlier.json().nextCursor, null);

      const forward = await app.inject({ method: "GET", url: path, headers });
      assert.deepEqual(
        forward.json().messages.map((item: { id: string }) => item.id),
        ids.slice(0, 50),
      );
      assert.equal(forward.json().nextCursor, ids[49]);
      const recovered = await app.inject({
        method: "GET",
        url: `${path}?cursor=${forward.json().nextCursor}`,
        headers,
      });
      assert.deepEqual(
        recovered.json().messages.map((item: { id: string }) => item.id),
        ids.slice(50),
      );
      assert.equal(recovered.json().nextCursor, null);

      const outside = await app.inject({
        method: "GET",
        url: `${path}?direction=backward`,
        headers: {
          authorization: `Bearer ${app.jwt.sign({ sub: userIds[2], email: "outside@example.test" })}`,
        },
      });
      assert.equal(outside.statusCode, 404);
      for (const query of [
        "direction=invalid",
        `direction=backward&cursor=${randomUUID()}`,
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `${path}?${query}`,
          headers,
        });
        assert.equal(invalid.statusCode, 400);
      }

      await app.postgres.query(
        "UPDATE messages SET created_at = '2026-10-08T12:00:00.0001Z' WHERE id = $1",
        [ids[64]],
      );
      await app.postgres.query(
        "UPDATE messages SET created_at = '2026-10-08T12:00:00.0009Z' WHERE id = $1",
        [ids[0]],
      );
      const precise = await app.inject({
        method: "GET",
        url: `${path}?direction=backward&limit=2`,
        headers,
      });
      assert.deepEqual(
        precise.json().messages.map((item: { id: string }) => item.id),
        [ids[64], ids[0]],
      );
      assert.deepEqual(
        precise
          .json()
          .messages.map((item: { createdAt: string }) => item.createdAt),
        ["2026-10-08T12:00:00.000100Z", "2026-10-08T12:00:00.000900Z"],
      );
      const preciseRecovery = await app.inject({
        method: "GET",
        url: `${path}?cursor=${ids[64]}`,
        headers,
      });
      assert.equal(preciseRecovery.json().messages[0].id, ids[0]);

      const atLimit = await app.inject({
        method: "POST",
        url: path,
        headers,
        payload: {
          clientMessageId: randomUUID(),
          content: `  ${"a".repeat(2000)}  `,
        },
      });
      assert.equal(atLimit.statusCode, 201);
      assert.equal(atLimit.json().content.length, 2000);
      const oversized = await app.inject({
        method: "POST",
        url: path,
        headers,
        payload: { clientMessageId: randomUUID(), content: "a".repeat(2001) },
      });
      assert.equal(oversized.statusCode, 400);
    } finally {
      await app.postgres.query("DELETE FROM conversations WHERE id = $1", [
        conversationId,
      ]);
      await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        userIds,
      ]);
      await app.close();
    }
  },
);

test(
  "messages persist in chronological order and require conversation membership",
  { skip: !canRunMessageTest },
  async () => {
    const environment = loadEnvironment();
    const app = await buildApp({
      databaseUrl: environment.DATABASE_URL,
      jwtSecret: environment.JWT_SECRET,
    });
    const firstUser = {
      email: `first-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const secondUser = {
      email: `second-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const outsideUser = {
      email: `outside-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const thirdUser = {
      email: `third-${randomUUID()}@example.test`,
      id: randomUUID(),
    };
    const firstToken = app.jwt.sign({
      sub: firstUser.id,
      email: firstUser.email,
    });
    const secondToken = app.jwt.sign({
      sub: secondUser.id,
      email: secondUser.email,
    });
    const outsideToken = app.jwt.sign({
      sub: outsideUser.id,
      email: outsideUser.email,
    });
    let conversationId: string | undefined;
    let secondConversationId: string | undefined;
    const firstClientMessageId = randomUUID();

    try {
      await app.postgres.query(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9), ($10, $11, $12)`,
        [
          firstUser.id,
          firstUser.email,
          "unused",
          secondUser.id,
          secondUser.email,
          "unused",
          outsideUser.id,
          outsideUser.email,
          "unused",
          thirdUser.id,
          thirdUser.email,
          "unused",
        ],
      );
      const conversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { participantId: secondUser.id },
      });
      conversationId = conversation.json().id;

      const firstMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: {
          clientMessageId: firstClientMessageId,
          content: "First message",
        },
      });
      assert.equal(firstMessage.statusCode, 201);
      assert.equal(firstMessage.json().senderId, firstUser.id);

      const repeatedMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: {
          clientMessageId: firstClientMessageId,
          content: "First message",
        },
      });
      assert.equal(repeatedMessage.statusCode, 200);
      assert.equal(repeatedMessage.json().id, firstMessage.json().id);

      const secondConversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { participantId: thirdUser.id },
      });
      secondConversationId = secondConversation.json().id;

      const retryInAnotherConversation = await app.inject({
        method: "POST",
        url: `/conversations/${secondConversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: {
          clientMessageId: firstClientMessageId,
          content: "First message",
        },
      });
      assert.equal(retryInAnotherConversation.statusCode, 200);
      assert.equal(
        retryInAnotherConversation.json().id,
        firstMessage.json().id,
      );

      const secondMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { clientMessageId: randomUUID(), content: "Second message" },
      });
      assert.equal(secondMessage.statusCode, 201);

      const publishMessage = app.realtime.publishMessage;
      app.realtime.publishMessage = () => {
        throw new Error("Simulated delivery failure");
      };
      const persistedMessageAfterDeliveryFailure = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: {
          clientMessageId: randomUUID(),
          content: "Persisted after delivery failure",
        },
      });
      app.realtime.publishMessage = publishMessage;
      assert.equal(persistedMessageAfterDeliveryFailure.statusCode, 201);

      const firstHistoryPage = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages?limit=2`,
        headers: { authorization: `Bearer ${secondToken}` },
      });
      assert.equal(firstHistoryPage.statusCode, 200);
      assert.deepEqual(
        firstHistoryPage
          .json()
          .messages.map((message: { content: string }) => message.content),
        ["First message", "Second message"],
      );
      assert.equal(firstHistoryPage.json().nextCursor, secondMessage.json().id);

      const secondHistoryPage = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages?limit=2&cursor=${firstHistoryPage.json().nextCursor}`,
        headers: { authorization: `Bearer ${secondToken}` },
      });
      assert.deepEqual(
        secondHistoryPage
          .json()
          .messages.map((message: { content: string }) => message.content),
        ["Persisted after delivery failure"],
      );
      assert.equal(secondHistoryPage.json().nextCursor, null);

      const invalidMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { clientMessageId: randomUUID(), content: " " },
      });
      assert.equal(invalidMessage.statusCode, 400);

      const outsideWrite = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${outsideToken}` },
        payload: {
          clientMessageId: randomUUID(),
          content: "Unauthorized message",
        },
      });
      assert.equal(outsideWrite.statusCode, 404);

      const memberHistoryAfterOutsideWrite = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
      });
      assert.equal(memberHistoryAfterOutsideWrite.json().messages.length, 3);

      const outsideRead = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${outsideToken}` },
      });
      assert.equal(outsideRead.statusCode, 404);

      await app.postgres.query(
        "DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
        [conversationId, firstUser.id],
      );
      const retryAfterMembershipRemoval = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: {
          clientMessageId: firstClientMessageId,
          content: "First message",
        },
      });
      assert.equal(retryAfterMembershipRemoval.statusCode, 404);
    } finally {
      if (secondConversationId) {
        await app.postgres.query("DELETE FROM conversations WHERE id = $1", [
          secondConversationId,
        ]);
      }
      if (conversationId) {
        await app.postgres.query("DELETE FROM conversations WHERE id = $1", [
          conversationId,
        ]);
      }
      await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [firstUser.id, secondUser.id, outsideUser.id, thirdUser.id],
      ]);
      await app.close();
    }
  },
);
