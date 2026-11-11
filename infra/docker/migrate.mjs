import { runner } from "node-pg-migrate";
import { databaseUrl } from "./database.mjs";

try {
  await runner({
    databaseUrl: databaseUrl(),
    dir: "migrations",
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    checkOrder: true,
  });
} catch {
  console.error(
    "Migration failed; inspect database/migration logs before retrying.",
  );
  process.exitCode = 1;
}
