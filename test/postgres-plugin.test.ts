import assert from "node:assert/strict";
import { test } from "node:test";

import Fastify from "fastify";
import type { Pool } from "pg";

import { postgresPlugin } from "../src/plugins/postgres.js";

test("PostgreSQL plugin decorates the application and closes the pool", async () => {
  let closed = false;
  const pool = {
    end: async () => {
      closed = true;
    },
  } as unknown as Pool;
  const app = Fastify();

  await app.register(postgresPlugin, {
    connectionString: "postgresql://example.invalid/newmessenger",
    pool,
  });

  assert.equal(app.postgres, pool);

  await app.close();

  assert.equal(closed, true);
});
