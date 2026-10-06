import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { loadEnvironment } from "../src/config/env.js";
import { buildApp } from "../src/app.js";

const canRunAuthenticationTest = Boolean(
  process.env.DATABASE_URL || existsSync(".env"),
);

test(
  "authentication registers, logs in, and protects the current user endpoint",
  { skip: !canRunAuthenticationTest },
  async () => {
    const environment = loadEnvironment();
    const app = await buildApp({
      databaseUrl: environment.DATABASE_URL,
      jwtSecret: environment.JWT_SECRET,
    });
    const email = `user-${randomUUID()}@example.test`;
    const password = "correct-horse-battery-staple";

    try {
      const registration = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: email.toUpperCase(), password },
      });
      assert.equal(registration.statusCode, 201);
      assert.equal(typeof registration.json().accessToken, "string");

      const duplicateRegistration = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password },
      });
      assert.equal(duplicateRegistration.statusCode, 409);

      const invalidRegistration = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: "too-short" },
      });
      assert.equal(invalidRegistration.statusCode, 400);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      assert.equal(login.statusCode, 200);
      const accessToken = login.json().accessToken;

      const currentUser = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      assert.equal(currentUser.statusCode, 200);
      assert.equal(currentUser.json().email, email);

      const unauthenticatedCurrentUser = await app.inject({
        method: "GET",
        url: "/auth/me",
      });
      assert.equal(unauthenticatedCurrentUser.statusCode, 401);

      const invalidLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "invalid-password" },
      });
      assert.equal(invalidLogin.statusCode, 401);
      assert.deepEqual(invalidLogin.json(), { message: "Unauthorized" });
    } finally {
      await app.postgres.query("DELETE FROM users WHERE email = $1", [email]);
      await app.close();
    }
  },
);
