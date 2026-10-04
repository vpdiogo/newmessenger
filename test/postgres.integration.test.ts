import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { Pool } from "pg";

import { loadEnvironment } from "../src/config/env.js";

const canConnectToDatabase = Boolean(
  process.env.DATABASE_URL || existsSync(".env"),
);

test(
  "PostgreSQL accepts connections",
  { skip: !canConnectToDatabase },
  async () => {
    const environment = loadEnvironment();
    const pool = new Pool({ connectionString: environment.DATABASE_URL });

    try {
      const result = await pool.query<{ value: number }>("SELECT 1 AS value");

      assert.equal(result.rows[0]?.value, 1);
    } finally {
      await pool.end();
    }
  },
);
