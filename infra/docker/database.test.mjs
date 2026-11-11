import assert from "node:assert/strict";
import { test } from "node:test";

import { databaseUrl } from "./database.mjs";

test("database credentials cannot change the internal host or inject URL options", () => {
  const password = "a-long-password-with-URL-characters:@/?#%&=";
  const url = new URL(databaseUrl({ APP_DB_PASSWORD: password }));
  assert.equal(decodeURIComponent(url.password), password);
  assert.equal(url.hostname, "postgres");
  assert.equal(url.port, "5432");
  assert.equal(url.username, "newmessenger");
  assert.equal(url.pathname, "/newmessenger");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
});

test("missing or short credentials fail without revealing their value", () => {
  for (const password of [undefined, "", "too-short-private-value"]) {
    assert.throws(() => databaseUrl({ APP_DB_PASSWORD: password }), {
      message: "APP_DB_PASSWORD must contain at least 32 characters",
    });
  }
});
