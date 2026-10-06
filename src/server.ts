import { buildApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";

const environment = loadEnvironment();
const app = await buildApp({
  databaseUrl: environment.DATABASE_URL,
  jwtSecret: environment.JWT_SECRET,
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({
    host: environment.HOST,
    port: environment.PORT,
  });
} catch (error) {
  app.log.error(error, "Unable to start server");
  process.exitCode = 1;
  await app.close();
}
