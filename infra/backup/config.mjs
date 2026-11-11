import { validateTelegram } from "./telegram.mjs";

export const backupHost = "newmessenger";
export const backupTag = "newmessenger-postgres";
export const restoreDatabase = "newmessenger_restore";

export function loadConfig(env) {
  validateTelegram(env);
  for (const key of [
    "RESTIC_REPOSITORY",
    "RESTIC_PASSWORD",
    "APP_DB_PASSWORD",
  ]) {
    if (!env[key] || /REPLACE/.test(env[key]))
      throw new Error(`Configure ${key}`);
  }
  if (env.RESTIC_PASSWORD.length < 32 || env.APP_DB_PASSWORD.length < 32) {
    throw new Error(
      "Use database and repository passwords of at least 32 characters",
    );
  }
  if (env.RESTIC_REPOSITORY !== "/repository") {
    if (!env.RESTIC_REPOSITORY.startsWith("s3:https://")) {
      throw new Error(
        "Use an HTTPS S3 repository or /repository for local rehearsal",
      );
    }
    const url = new URL(env.RESTIC_REPOSITORY.slice(3));
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname === "/"
    ) {
      throw new Error(
        "Repository must specify a bucket without embedded credentials",
      );
    }
    for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
      if (!env[key] || /REPLACE/.test(env[key]))
        throw new Error(`Configure ${key}`);
    }
  }
  const database = env.POSTGRES_DB || "newmessenger";
  const user = env.APP_DB_USER || "newmessenger";
  if (![database, user].every((v) => /^[a-z][a-z0-9_]{0,62}$/.test(v))) {
    throw new Error("Use simple PostgreSQL database and role identifiers");
  }
  const warningBytes = Number(env.BACKUP_WARNING_BYTES || 8_000_000_000);
  if (
    !Number.isSafeInteger(warningBytes) ||
    warningBytes < 1 ||
    warningBytes >= 10_000_000_000
  ) {
    throw new Error("BACKUP_WARNING_BYTES must be positive and below 10 GB");
  }
  return {
    database,
    user,
    warningBytes,
    stateDir: "/state",
    env: {
      ...env,
      PGCONNECT_TIMEOUT: "5",
      PGPASSWORD: env.APP_DB_PASSWORD,
      RESTIC_CACHE_DIR: "/state/cache",
    },
  };
}
