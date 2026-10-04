import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    postgres: Pool;
  }
}

type PostgresPluginOptions = {
  connectionString: string;
  pool?: Pool;
};

const registerPostgres: FastifyPluginAsync<PostgresPluginOptions> = async (
  app,
  options,
) => {
  const pool =
    options.pool ?? new Pool({ connectionString: options.connectionString });

  app.decorate("postgres", pool);
  app.addHook("onClose", async () => {
    await pool.end();
  });
};

export const postgresPlugin = fp(registerPostgres, {
  name: "postgres",
});
