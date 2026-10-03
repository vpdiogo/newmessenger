import Fastify from "fastify";
import websocket from "@fastify/websocket";

import { healthRoutes } from "./modules/health/routes.js";
import { realtimeRoutes } from "./modules/realtime/routes.js";
import { postgresPlugin } from "./plugins/postgres.js";

type BuildAppOptions = {
  databaseUrl?: string;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });

  await app.register(websocket);
  if (options.databaseUrl) {
    await app.register(postgresPlugin, {
      connectionString: options.databaseUrl,
    });
  }
  await app.register(healthRoutes);
  await app.register(realtimeRoutes);

  return app;
}
