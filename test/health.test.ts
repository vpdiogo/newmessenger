import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../src/app.js";

test("GET /health returns an ok status", async (context) => {
  const app = await buildApp({
    databaseUrl: "postgresql://example.invalid/test",
    jwtSecret: "test-secret-that-is-at-least-32-characters",
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});
