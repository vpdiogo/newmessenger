import { existsSync } from "node:fs";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  CORS_ORIGIN: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): Environment {
  if (input === process.env && existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  return environmentSchema.parse(input);
}
