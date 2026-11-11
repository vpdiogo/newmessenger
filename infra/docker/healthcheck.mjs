import pg from "pg";
import { databaseUrl } from "./database.mjs";

const pool = new pg.Pool({
  connectionString: databaseUrl(),
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
});
try {
  const response = await fetch("http://127.0.0.1:3000/health", {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("HTTP unavailable");
  await pool.query("SELECT 1");
} catch {
  process.exitCode = 1;
} finally {
  await pool.end();
}
