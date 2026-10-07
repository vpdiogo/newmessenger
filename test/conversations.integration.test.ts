import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";

const canRunConversationTest = Boolean(
  process.env.DATABASE_URL || existsSync(".env"),
);

test(
  "conversations create one direct conversation per pair and list memberships",
  { skip: !canRunConversationTest },
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
    const firstToken = app.jwt.sign({
      sub: firstUser.id,
      email: firstUser.email,
    });
    const secondToken = app.jwt.sign({
      sub: secondUser.id,
      email: secondUser.email,
    });

    try {
      await app.postgres.query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3), ($4, $5, $6)",
        [
          firstUser.id,
          firstUser.email,
          "unused",
          secondUser.id,
          secondUser.email,
          "unused",
        ],
      );

      const createdConversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { participantId: secondUser.id },
      });
      assert.equal(createdConversation.statusCode, 201);
      const conversationId = createdConversation.json().id;

      const repeatedConversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${secondToken}` },
        payload: { participantId: firstUser.id.toUpperCase() },
      });
      assert.equal(repeatedConversation.statusCode, 200);
      assert.equal(repeatedConversation.json().id, conversationId);

      const firstUserConversations = await app.inject({
        method: "GET",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
      });
      assert.equal(firstUserConversations.statusCode, 200);
      const conversations = firstUserConversations.json();
      assert.equal(conversations.length, 1);
      assert.equal(conversations[0].id, conversationId);
      assert.match(conversations[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.deepEqual(conversations[0].participant, {
        id: secondUser.id,
        email: secondUser.email,
      });

      const invalidConversation = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { participantId: firstUser.id.toUpperCase() },
      });
      assert.equal(invalidConversation.statusCode, 400);

      const missingParticipant = await app.inject({
        method: "POST",
        url: "/conversations",
        headers: { authorization: `Bearer ${firstToken}` },
        payload: { participantId: randomUUID() },
      });
      assert.equal(missingParticipant.statusCode, 404);
    } finally {
      await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [firstUser.id, secondUser.id],
      ]);
      await app.close();
    }
  },
);
