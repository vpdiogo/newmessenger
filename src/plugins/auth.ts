import jwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { email: string; sub: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

type AuthPluginOptions = { secret: string };

const registerAuth: FastifyPluginAsync<AuthPluginOptions> = async (
  app,
  options,
) => {
  await app.register(jwt, {
    secret: options.secret,
    sign: { expiresIn: "15m" },
  });
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ message: "Unauthorized" });
      }
    },
  );
};

export const authPlugin = fp(registerAuth, { name: "auth" });
