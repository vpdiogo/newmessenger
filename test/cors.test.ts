import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../src/app.js";

test("GET /health allows the configured web origin", async (context) => {
  const app = await buildApp({
    corsOrigin: "http://localhost:5173",
    databaseUrl: "postgresql://example.invalid/test",
    jwtSecret: "test-secret-that-is-at-least-32-characters",
  });
  context.after(() => app.close());

  const response = await app.inject({
    headers: { origin: "http://localhost:5173" },
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
});
