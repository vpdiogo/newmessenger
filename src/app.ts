import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";

import { httpWriteLimitPlugin } from "./plugins/http-write-limit.js";

import { healthRoutes } from "./modules/health/routes.js";
import { realtimeRoutes } from "./modules/realtime/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { conversationRoutes } from "./modules/conversations/routes.js";
import { messageRoutes } from "./modules/messages/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { postgresPlugin } from "./plugins/postgres.js";
import { realtimePlugin } from "./plugins/realtime.js";

type BuildAppOptions = {
  corsOrigin?: string;
  databaseUrl: string;
  jwtSecret: string;
  httpWriteRateLimitEnabled?: boolean;
  rateLimitClock?: () => number;
};

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true, bodyLimit: 32 * 1024 });

  await app.register(cors, { origin: options.corsOrigin ?? false });
  await app.register(websocket);
  await app.register(postgresPlugin, { connectionString: options.databaseUrl });
  await app.register(authPlugin, { secret: options.jwtSecret });
  await app.register(httpWriteLimitPlugin, {
    enabled: options.httpWriteRateLimitEnabled ?? false,
    ...(options.rateLimitClock ? { clock: options.rateLimitClock } : {}),
  });
  await app.register(realtimePlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(realtimeRoutes);

  return app;
}
