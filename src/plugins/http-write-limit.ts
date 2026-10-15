import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { HttpWriteLimiter, type WriteCategory } from "../limits/http-write.js";

declare module "fastify" {
  interface FastifyInstance {
    limitHttpWrite: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

type Options = { enabled: boolean; clock?: () => number };

const registerLimit: FastifyPluginAsync<Options> = async (app, options) => {
  const limiter = new HttpWriteLimiter(options.clock);
  app.addHook("onClose", async () => limiter.dispose());
  app.decorate("limitHttpWrite", async (request, reply) => {
    if (!options.enabled) return;
    const category: WriteCategory =
      request.routeOptions.url === "/conversations"
        ? "conversation"
        : "message";
    const result = limiter.admit(category, request.user.sub.toLowerCase());
    if (result.admitted) return;
    const statusCode = result.reason === "quota" ? 429 : 503;
    request.log.warn(
      {
        route: request.routeOptions.url,
        category: result.reason,
        keyType: "authenticated-user",
        retryAfter: result.retryAfter,
        statusCode,
      },
      "HTTP write admission rejected",
    );
    reply
      .code(statusCode)
      .header("Retry-After", result.retryAfter)
      .header("Cache-Control", "no-store")
      .send({
        message:
          statusCode === 429
            ? "Too many requests"
            : "Service temporarily unavailable",
      });
  });
};

export const httpWriteLimitPlugin = fp(registerLimit, {
  name: "http-write-limit",
  dependencies: ["auth"],
});
