import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { WebSocket } from "ws";

import { buildApp } from "../src/app.js";

test("GET /ws accepts an authenticated WebSocket connection", async () => {
  const app = await buildApp({
    databaseUrl: "postgresql://example.invalid/test",
    jwtSecret: "test-secret-that-is-at-least-32-characters",
  });

  try {
    await app.ready();
    const accessToken = app.jwt.sign({
      sub: "e79d6a86-524b-4a4a-8f08-89d55fcce7ad",
      email: "user@example.test",
    });
    const socket = await app.injectWS("/ws", {
      headers: { "sec-websocket-protocol": `bearer, ${accessToken}` },
    });

    try {
      assert.ok(socket);
    } finally {
      socket.terminate();
    }
  } finally {
    await app.close();
  }
});

test("GET /ws closes an unauthenticated WebSocket connection", async () => {
  const app = await buildApp({
    databaseUrl: "postgresql://example.invalid/test",
    jwtSecret: "test-secret-that-is-at-least-32-characters",
  });

  try {
    await app.ready();
    const socket = await app.injectWS("/ws");
    const [closeCode] = await once(socket, "close");
    assert.equal(closeCode, 1008);
    assert.equal(socket.readyState, WebSocket.CLOSED);
  } finally {
    await app.close();
  }
});
