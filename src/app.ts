import Fastify from "fastify";
import websocket from "@fastify/websocket";

import { healthRoutes } from "./modules/health/routes.js";
import { realtimeRoutes } from "./modules/realtime/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { conversationRoutes } from "./modules/conversations/routes.js";
import { messageRoutes } from "./modules/messages/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { postgresPlugin } from "./plugins/postgres.js";

type BuildAppOptions = {
  databaseUrl: string;
  jwtSecret: string;
};

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true });

  await app.register(websocket);
  await app.register(postgresPlugin, { connectionString: options.databaseUrl });
  await app.register(authPlugin, { secret: options.jwtSecret });
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(realtimeRoutes);

  return app;
}
