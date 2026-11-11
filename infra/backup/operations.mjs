import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  backupHost,
  backupTag,
  loadConfig,
  restoreDatabase,
} from "./config.mjs";
import { execute } from "./command.mjs";
import { notify } from "./telegram.mjs";

const selection = ["--host", backupHost, "--tag", backupTag];

async function digest(file) {
  if (!(await lstat(file)).isFile())
    throw new Error("Expected a regular backup file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function previousStatus(stateDir) {
  try {
    return JSON.parse(await readFile(join(stateDir, "status.json"), "utf8"));
  } catch {
    return {};
  }
}

export async function operate(action, env, dependencies = {}) {
  const run = dependencies.run || execute;
  const alert = dependencies.alert || notify;
  const log =
    dependencies.log || ((entry) => console.log(JSON.stringify(entry)));
  const stateDir = dependencies.stateDir || "/state";
  const work = join(stateDir, "work");
  const startedAt = new Date().toISOString();
  const previous = await previousStatus(stateDir);
  const status = {
    operation: action,
    startedAt,
    lastSuccessfulBackupAt: previous.lastSuccessfulBackupAt || null,
  };
  let stage = "configuration";
  let code = 0;
  let cleanupFailed = false;
  let warning = false;
  let needsCleanup = false;
  try {
    const config = loadConfig(env);
    const call = (program, args) =>
      run(program, args, { env: config.env, signal: dependencies.signal });
    const restic = (...args) => call("restic", args);
    const sql = (host, database, query) =>
      call("psql", [
        "-h",
        host,
        "-U",
        config.user,
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-Atqc",
        query,
      ]);
    const matches = async (snapshot) => {
      const rows = JSON.parse(
        await restic(
          "snapshots",
          "--json",
          ...selection,
          ...(snapshot ? [snapshot] : []),
        ),
      );
      if (!Array.isArray(rows)) throw new Error("Invalid snapshot inventory");
      return rows.filter(
        (s) => s.hostname === backupHost && s.tags?.includes(backupTag),
      );
    };
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    if (action === "init") {
      stage = "repository-initialization";
      await restic("init", "--repository-version", "2");
    } else if (action === "test-alert") {
      stage = "test-alert";
      await alert(env, "New Messenger: owner-requested backup alert test.");
      status.alertDelivered = true;
    } else if (action === "snapshots") {
      stage = "snapshot-inventory";
      const snapshots = await matches();
      log({ snapshots: snapshots.map(({ id, time }) => ({ id, time })) });
    } else if (action === "backup" || action === "restore") {
      needsCleanup = true;
      await rm(work, { recursive: true, force: true });
      await mkdir(work, { mode: 0o700 });
      if (action === "backup") {
        stage = "database-dump";
        const dump = join(work, "database.dump");
        await call("pg_dump", [
          "-h",
          "postgres",
          "-U",
          config.user,
          "-d",
          config.database,
          "--format=custom",
          "--lock-wait-timeout=10s",
          "--file",
          dump,
        ]);
        await chmod(dump, 0o600);
        await call("pg_restore", ["--list", dump]);
        await writeFile(
          join(work, "manifest.json"),
          JSON.stringify({
            formatVersion: 1,
            postgresMajor: 17,
            database: config.database,
            createdAt: startedAt,
            sha256: await digest(dump),
          }),
          { mode: 0o600 },
        );
        stage = "repository-upload";
        const output = await restic("backup", "--json", ...selection, work);
        const summary = output
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .find((entry) => entry.message_type === "summary");
        if (!/^[a-f0-9]{64}$/.test(summary?.snapshot_id || ""))
          throw new Error("Missing completed snapshot");
        status.snapshot = summary.snapshot_id;
        stage = "repository-verification";
        await restic("check", "--read-data");
        status.verified = true;
        stage = "retention";
        await restic(
          "forget",
          ...selection,
          "--group-by",
          "host,tags",
          "--keep-daily",
          "7",
          "--keep-weekly",
          "4",
          "--prune",
        );
        stage = "usage";
        const usage = JSON.parse(
          await restic("stats", "--json", "--mode", "raw-data"),
        );
        if (!Number.isSafeInteger(usage.total_size) || usage.total_size < 0)
          throw new Error("Invalid usage estimate");
        status.repositoryDataBytes = usage.total_size;
        warning = usage.total_size >= config.warningBytes;
      } else {
        stage = "restore-validation";
        if (
          env.RESTORE_CONFIRM !== restoreDatabase ||
          !/^[a-f0-9]{64}$/.test(env.RESTORE_SNAPSHOT || "") ||
          config.database === restoreDatabase
        ) {
          throw new Error(
            "Specify a full snapshot ID and confirm the isolated restore database",
          );
        }
        const snapshots = await matches(env.RESTORE_SNAPSHOT);
        if (snapshots.length !== 1 || snapshots[0].id !== env.RESTORE_SNAPSHOT)
          throw new Error("Snapshot does not belong to this application");
        const count = await sql(
          "restore-postgres",
          restoreDatabase,
          "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'",
        );
        if (count.trim() !== "0")
          throw new Error("Restore database must be empty");
        stage = "snapshot-download";
        const target = join(work, "restored");
        await restic(
          "restore",
          env.RESTORE_SNAPSHOT,
          "--target",
          target,
          "--verify",
        );
        const source = join(target, "state", "work");
        const manifestFile = join(source, "manifest.json");
        if (!(await lstat(manifestFile)).isFile())
          throw new Error("Invalid manifest file");
        const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
        const dump = join(source, "database.dump");
        if (
          manifest.formatVersion !== 1 ||
          manifest.postgresMajor !== 17 ||
          manifest.database !== config.database ||
          manifest.sha256 !== (await digest(dump))
        ) {
          throw new Error("Backup manifest or digest mismatch");
        }
        stage = "database-restore";
        await call("pg_restore", [
          "-h",
          "restore-postgres",
          "-U",
          config.user,
          "-d",
          restoreDatabase,
          "--single-transaction",
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
          dump,
        ]);
        stage = "restored-data-verification";
        status.restoredCounts = JSON.parse(
          await sql(
            "restore-postgres",
            restoreDatabase,
            "SELECT json_build_object('users',(SELECT count(*) FROM users),'messages',(SELECT count(*) FROM messages),'migrations',(SELECT count(*) FROM pgmigrations))",
          ),
        );
        status.snapshot = env.RESTORE_SNAPSHOT;
      }
    } else {
      throw new Error("Unknown operation");
    }
  } catch (error) {
    code =
      Number.isInteger(error.exitCode) &&
      error.exitCode > 0 &&
      error.exitCode < 256
        ? error.exitCode
        : 1;
  } finally {
    if (needsCleanup) {
      try {
        await rm(work, { recursive: true, force: true });
      } catch {
        cleanupFailed = true;
        if (!code) {
          code = 1;
          stage = "cleanup";
        }
      }
    }
  }
  if (code || warning) {
    try {
      await alert(
        env,
        code
          ? `New Messenger ${action} failed at ${stage} (exit ${code}). Check local job status.`
          : `New Messenger backup usage warning: repository data estimate ${status.repositoryDataBytes} bytes. Check R2 bucket/account usage and billing.`,
      );
      status.alertDelivered = true;
    } catch {
      status.alertDelivered = false;
      if (!code) {
        code = 1;
        stage = "usage-alert";
      }
    }
  }
  if (action === "backup" && status.verified && !code)
    status.lastSuccessfulBackupAt = new Date().toISOString();
  Object.assign(status, {
    completedAt: new Date().toISOString(),
    stage,
    exitCode: code,
    cleanupFailed,
  });
  try {
    await writeFile(join(stateDir, "status.json.tmp"), JSON.stringify(status), {
      mode: 0o600,
    });
    await rename(
      join(stateDir, "status.json.tmp"),
      join(stateDir, "status.json"),
    );
  } catch {
    log({ statusWriteFailed: true });
    if (!code) {
      code = 1;
      status.exitCode = code;
      status.stage = "status-write";
      try {
        await alert(
          env,
          "New Messenger operational job could not save its status. Check local storage.",
        );
        status.alertDelivered = true;
      } catch {
        status.alertDelivered = false;
      }
    }
  }
  log(status);
  return code;
}
