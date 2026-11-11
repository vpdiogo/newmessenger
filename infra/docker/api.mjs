import { databaseUrl } from "./database.mjs";

process.env.DATABASE_URL = databaseUrl();
await import("../../dist/server.js");
