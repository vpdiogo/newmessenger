import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(256),
});

type User = { email: string; id: string; password_hash: string };

function credentials(body: unknown) {
  const result = credentialsSchema.safeParse(body);
  return result.success
    ? { ...result.data, email: result.data.email.toLowerCase() }
    : null;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (request, reply) => {
    const input = credentials(request.body);
    if (!input) return reply.code(400).send({ message: "Invalid request" });

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    try {
      const result = await app.postgres.query<Pick<User, "email" | "id">>(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email",
        [randomUUID(), input.email, passwordHash],
      );
      const user = result.rows[0];
      if (!user) throw new Error("User creation failed");
      return reply.code(201).send({
        accessToken: app.jwt.sign({ sub: user.id, email: user.email }),
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return reply.code(409).send({ message: "Email already registered" });
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const input = credentials(request.body);
    if (!input) return reply.code(400).send({ message: "Invalid request" });
    const result = await app.postgres.query<User>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [input.email],
    );
    const user = result.rows[0];
    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    return { accessToken: app.jwt.sign({ sub: user.id, email: user.email }) };
  });

  app.get(
    "/auth/me",
    { preHandler: app.authenticate },
    async (request) => request.user,
  );
};
