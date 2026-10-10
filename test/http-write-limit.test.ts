import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { HttpWriteLimiter } from "../src/limits/http-write.js";
import { loadEnvironment } from "../src/config/env.js";
import { buildApp } from "../src/app.js";

test("fixed windows, independent identities, namespaces and instances", () => {
  let now = 0;
  const limiter = new HttpWriteLimiter(() => now);
  for (let i = 0; i < 20; i++)
    assert.deepEqual(limiter.admit("conversation", "a"), { admitted: true });
  now = 1;
  assert.deepEqual(limiter.admit("conversation", "a"), {
    admitted: false,
    reason: "quota",
    retryAfter: 3600,
  });
  for (let i = 0; i < 60; i++)
    assert.equal(limiter.admit("message", "a").admitted, true);
  assert.equal(limiter.admit("message", "a").admitted, false);
  assert.equal(limiter.admit("conversation", "b").admitted, true);
  assert.equal(
    new HttpWriteLimiter(() => now).admit("conversation", "a").admitted,
    true,
  );
  now = 60_001;
  assert.equal(limiter.admit("message", "a").admitted, true);
  now = 3_599_999;
  assert.deepEqual(limiter.admit("conversation", "a"), {
    admitted: false,
    reason: "quota",
    retryAfter: 1,
  });
  now = 3_600_000;
  assert.equal(limiter.admit("conversation", "a").admitted, true);
});

test("bounded state never evicts live budgets and incrementally cleans expired entries", () => {
  let now = 0;
  const limiter = new HttpWriteLimiter(() => now);
  for (let i = 0; i < 10_000; i++)
    assert.equal(
      limiter.admit(i % 2 ? "message" : "conversation", String(i)).admitted,
      true,
    );
  assert.deepEqual(limiter.admit("conversation", "fresh"), {
    admitted: false,
    reason: "capacity",
    retryAfter: 1,
  });
  for (let i = 1; i < 20; i++)
    assert.equal(limiter.admit("conversation", "0").admitted, true);
  assert.equal(limiter.admit("conversation", "0").admitted, false);
  now = 60_000;
  for (let i = 0; i < 100; i++) limiter.admit("message", `replacement-${i}`);
  assert.equal(limiter.admit("message", "replacement-final").admitted, true);
  assert.equal(limiter.admit("conversation", "0").admitted, false);
  limiter.dispose();
  assert.equal(limiter.admit("conversation", "0").admitted, true);
});

test("simultaneous callers cannot oversubscribe admission", async () => {
  const limiter = new HttpWriteLimiter();
  const results = await Promise.all(
    Array.from({ length: 100 }, async () => limiter.admit("message", "a")),
  );
  assert.equal(results.filter((result) => result.admitted).length, 60);
});

test("environment switch defaults off and validates boolean spelling", () => {
  const base = {
    DATABASE_URL: "postgres://localhost/test",
    JWT_SECRET: "x".repeat(32),
  };
  assert.equal(loadEnvironment(base).HTTP_WRITE_RATE_LIMIT_ENABLED, false);
  assert.equal(
    loadEnvironment({ ...base, HTTP_WRITE_RATE_LIMIT_ENABLED: "true" })
      .HTTP_WRITE_RATE_LIMIT_ENABLED,
    true,
  );
  assert.throws(() =>
    loadEnvironment({ ...base, HTTP_WRITE_RATE_LIMIT_ENABLED: "yes" }),
  );
});

test("HTTP limits authenticate first, reject before DB/fan-out, and preserve retry after expiry", async () => {
  const env = loadEnvironment();
  let now = 0;
  const app = await buildApp({
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    httpWriteRateLimitEnabled: true,
    rateLimitClock: () => now,
  });
  const users: string[] = [];
  const conversations: string[] = [];
  try {
    const register = async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: `limit-${randomUUID()}@example.test`,
          password: "correct-horse-battery-staple",
        },
      });
      assert.equal(response.statusCode, 201);
      const token = response.json().accessToken as string;
      const user = app.jwt.verify<{ sub: string }>(token);
      users.push(user.sub);
      return { authorization: `Bearer ${token}` };
    };
    const headers = await register();
    const otherHeaders = await register();
    const create = await app.inject({
      method: "POST",
      url: "/conversations",
      headers,
      payload: { participantId: users[1] },
    });
    assert.equal(create.statusCode, 201);
    const id = create.json().id as string;
    conversations.push(id);
    for (let i = 1; i < 20; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/conversations",
        headers,
        payload: { participantId: users[1] },
      });
      assert.equal(response.statusCode, 200);
    }
    const clientMessageId = randomUUID();
    const send = () =>
      app.inject({
        method: "POST",
        url: `/conversations/${id}/messages`,
        headers,
        payload: { clientMessageId, content: "retry safely" },
      });
    const message = await send();
    assert.equal(message.statusCode, 201);
    for (let i = 1; i < 60; i++) assert.equal((await send()).statusCode, 200);
    const query = app.postgres.query;
    const connect = app.postgres.connect;
    const publish = app.realtime.publishMessage;
    app.postgres.query = (() => {
      throw new Error("Rejected request reached DB");
    }) as typeof query;
    app.postgres.connect = (() => {
      throw new Error("Rejected request connected to DB");
    }) as typeof connect;
    app.realtime.publishMessage = () => {
      throw new Error("Rejected request reached fan-out");
    };
    try {
      for (const response of [
        await send(),
        await app.inject({
          method: "POST",
          url: "/conversations",
          headers,
          payload: { participantId: users[1], userId: randomUUID() },
        }),
      ]) {
        assert.equal(response.statusCode, 429);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.ok(Number(response.headers["retry-after"]) > 0);
        assert.deepEqual(response.json(), { message: "Too many requests" });
      }
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/conversations",
            headers: { authorization: "Bearer invalid" },
            payload: {},
          })
        ).statusCode,
        401,
      );
    } finally {
      app.postgres.query = query;
      app.postgres.connect = connect;
      app.realtime.publishMessage = publish;
    }
    assert.equal(
      (await app.inject({ method: "GET", url: "/conversations", headers }))
        .statusCode,
      200,
    );
    for (const direction of ["forward", "backward"])
      assert.equal(
        (
          await app.inject({
            method: "GET",
            url: `/conversations/${id}/messages?direction=${direction}`,
            headers,
          })
        ).statusCode,
        200,
      );
    assert.equal(
      (await app.inject({ method: "GET", url: "/auth/me", headers }))
        .statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: "/health" })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/conversations",
          headers: otherHeaders,
          payload: {},
        })
      ).statusCode,
      400,
    );
    now = 60_000;
    const retry = await send();
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, message.json().id);
    const persisted = await app.postgres.query(
      "SELECT count(*)::int AS count FROM messages WHERE conversation_id = $1",
      [id],
    );
    assert.equal(persisted.rows[0].count, 1);
  } finally {
    for (const id of conversations)
      await app.postgres.query("DELETE FROM conversations WHERE id = $1", [id]);
    await app.postgres.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
      users,
    ]);
    await app.close();
  }
});

test("invalid JWTs allocate no state, saturation returns 503, disabled limits bypass accounting, body limit always applies", async () => {
  const env = loadEnvironment();
  for (const enabled of [true, false]) {
    const app = await buildApp({
      databaseUrl: env.DATABASE_URL,
      jwtSecret: env.JWT_SECRET,
      httpWriteRateLimitEnabled: enabled,
    });
    try {
      for (let i = 0; i < 25; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/conversations",
          headers: { authorization: "Bearer invalid" },
          payload: {},
        });
        assert.equal(response.statusCode, 401);
      }
      if (!enabled) {
        const authorization = `Bearer ${app.jwt.sign({ sub: randomUUID(), email: "test@example.test" })}`;
        for (let i = 0; i < 25; i++)
          assert.equal(
            (
              await app.inject({
                method: "POST",
                url: "/conversations",
                headers: { authorization },
                payload: {},
              })
            ).statusCode,
            400,
          );
      }
      for (let i = 0; i < 10_001; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/conversations",
          headers: {
            authorization: `Bearer ${app.jwt.sign({ sub: randomUUID(), email: "test@example.test" })}`,
          },
          payload: {},
        });
        assert.equal(response.statusCode, enabled && i === 10_000 ? 503 : 400);
        if (response.statusCode === 503) {
          assert.equal(response.headers["retry-after"], "1");
          assert.equal(response.headers["cache-control"], "no-store");
          assert.deepEqual(response.json(), {
            message: "Service temporarily unavailable",
          });
        }
      }
      const oversized = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { padding: "x".repeat(32 * 1024) },
      });
      assert.equal(oversized.statusCode, 413);
    } finally {
      await app.close();
    }
  }
});

test("authenticated validation and membership failures consume their own budgets", async () => {
  const env = loadEnvironment();
  const app = await buildApp({
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    httpWriteRateLimitEnabled: true,
  });
  try {
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: randomUUID(), email: "test@example.test" })}`,
    };
    for (let i = 0; i < 21; i++)
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/conversations",
            headers,
            payload: {},
          })
        ).statusCode,
        i < 20 ? 400 : 429,
      );
    for (let i = 0; i < 61; i++)
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/conversations/${randomUUID()}/messages`,
            headers,
            payload: { clientMessageId: randomUUID(), content: "not a member" },
          })
        ).statusCode,
        i < 60 ? 404 : 429,
      );
  } finally {
    await app.close();
  }
});
