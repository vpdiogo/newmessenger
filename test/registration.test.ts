import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import argon2 from "argon2";

import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";
import { registrationSchema } from "../src/modules/auth/registration.js";

test("registration boundaries preserve Unicode code-point length and exact password text", () => {
  const parse = (password: string, email = "user@example.test") =>
    registrationSchema.safeParse({ email, password });
  assert.equal(parse("a".repeat(14)).success, false);
  assert.equal(parse("a".repeat(15)).success, true);
  assert.equal(parse("a".repeat(256)).success, true);
  assert.equal(parse("a".repeat(257)).success, false);
  assert.equal(parse(" ".repeat(15)).success, false);
  assert.equal(parse("\t\n".repeat(8)).success, false);
  assert.equal(parse("prefix USER@EXAMPLE.TEST suffix").success, false);
  assert.equal(parse("prefix user@example suffix").success, true);
  assert.equal(parse("😀".repeat(14)).success, false);
  assert.equal(parse("😀".repeat(15)).success, true);
  assert.equal(parse("😀".repeat(256)).success, true);
  assert.equal(parse("😀".repeat(257)).success, false);
  for (const password of [
    "  café com nuvens e sal!  ",
    "  e\u0301 nuvens e café!  ",
    "river lantern mango orbit",
    "ç".repeat(15),
  ]) {
    const result = parse(password);
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.password, password);
  }
});

test("registration enforces policy before storage, returns field codes and preserves legacy login", async () => {
  const env = loadEnvironment();
  const app = await buildApp({
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
  });
  const emails: string[] = [];
  const email = `policy-${randomUUID()}@example.test`;
  const register = (password: unknown, address = email) =>
    app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: address, password },
    });
  try {
    const query = app.postgres.query;
    app.postgres.query = (() => {
      throw new Error("Invalid registration reached database");
    }) as typeof query;
    try {
      for (const [password, code] of [
        ["a".repeat(14), "password_length"],
        ["a".repeat(257), "password_length"],
        [" ".repeat(15), "password_blank"],
        [`prefix ${email.toUpperCase()}`, "password_contains_email"],
        [null, "password_length"],
      ]) {
        const response = await register(password);
        assert.equal(response.statusCode, 400);
        assert.deepEqual(response.json(), {
          message: "Invalid request",
          fieldErrors: { password: code },
        });
      }
      const invalidEmail = await register("a".repeat(15), "invalid");
      assert.equal(invalidEmail.statusCode, 400);
      assert.equal(invalidEmail.json().fieldErrors.email, "invalid_email");
    } finally {
      app.postgres.query = query;
    }
    const passwords = [
      "a".repeat(15),
      "a".repeat(256),
      "  café nuvem órbita!  ",
      "river lantern mango orbit",
      "😀".repeat(15),
      "  e\u0301 nuvens e café!  ",
    ];
    for (const password of passwords) {
      const address = `accepted-${randomUUID()}@example.test`;
      emails.push(address);
      const response = await register(password, address.toUpperCase());
      assert.equal(response.statusCode, 201);
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: address, password },
      });
      assert.equal(login.statusCode, 200);
      if (password !== password.trim()) {
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/auth/login",
              payload: { email: address, password: password.trim() },
            })
          ).statusCode,
          401,
        );
      }
      if (password !== password.normalize("NFC")) {
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/auth/login",
              payload: { email: address, password: password.normalize("NFC") },
            })
          ).statusCode,
          401,
        );
      }
    }
    const duplicate = await register("a".repeat(15), emails[0]);
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(duplicate.json(), {
      message: "Email already registered",
      fieldErrors: { email: "email_registered" },
    });
    const legacyEmail = `legacy-${randomUUID()}@example.test`;
    const legacyPassword = "a".repeat(12);
    emails.push(legacyEmail);
    await app.postgres.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [
        randomUUID(),
        legacyEmail,
        await argon2.hash(legacyPassword, { type: argon2.argon2id }),
      ],
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: legacyEmail, password: legacyPassword },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: legacyEmail, password: "b".repeat(12) },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.postgres.query(
      "DELETE FROM users WHERE email = ANY($1::text[])",
      [emails],
    );
    await app.close();
  }
});
