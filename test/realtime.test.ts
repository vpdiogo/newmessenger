import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../src/app.js";

test("GET /ws accepts a WebSocket connection", async () => {
  const app = await buildApp();

  try {
    await app.ready();
    const socket = await app.injectWS("/ws");

    try {
      assert.ok(socket);
    } finally {
      socket.terminate();
    }
  } finally {
    await app.close();
  }
});
