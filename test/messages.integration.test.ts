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

    try {
      await app.postgres.query(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)`,
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
        payload: { content: "First message" },
      });
      assert.equal(firstMessage.statusCode, 201);
      assert.equal(firstMessage.json().senderId, firstUser.id);

      const secondMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { content: "Second message" },
      });
      assert.equal(secondMessage.statusCode, 201);

      const history = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${secondToken}` },
      });
      assert.equal(history.statusCode, 200);
      assert.deepEqual(
        history.json().map((message: { content: string }) => message.content),
        ["First message", "Second message"],
      );

      const invalidMessage = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { content: " " },
      });
      assert.equal(invalidMessage.statusCode, 400);

      const outsideWrite = await app.inject({
        method: "POST",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${outsideToken}` },
        payload: { content: "Unauthorized message" },
      });
      assert.equal(outsideWrite.statusCode, 404);

      const memberHistoryAfterOutsideWrite = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${firstToken}` },
      });
      assert.equal(memberHistoryAfterOutsideWrite.json().length, 2);

      const outsideRead = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}/messages`,
        headers: { authorization: `Bearer ${outsideToken}` },
      });
      assert.equal(outsideRead.statusCode, 404);
    } finally {
      if (conversationId) {
        await app.postgres.query("DELETE FROM conversations WHERE id = $1", [
          conversationId,
        ]);
      }
      await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [firstUser.id, secondUser.id, outsideUser.id],
      ]);
      await app.close();
    }
  },
);
