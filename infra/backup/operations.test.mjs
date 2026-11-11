import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CommandFailure, execute } from "./command.mjs";
import { backupHost, backupTag, loadConfig } from "./config.mjs";
import { operate } from "./operations.mjs";

const snapshot = "a".repeat(64);
const env = {
  RESTIC_REPOSITORY: "/repository",
  RESTIC_PASSWORD: "repository-test-".repeat(4),
  APP_DB_PASSWORD: "database-test-".repeat(4),
  TELEGRAM_BOT_TOKEN: "123456:" + "t".repeat(35),
  TELEGRAM_CHAT_ID: "123456",
};
const dump = "A local fake archive for failure-path unit tests";

async function harness(t, options = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), "newmessenger-backup-test-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [],
    alerts = [],
    logs = [];
  const dependencies = {
    stateDir,
    log: (row) => logs.push(row),
    alert: async (input, text) => {
      alerts.push(text);
      if (options.alertFailure)
        throw new Error("credential-bearing URL must never be logged");
    },
    run: async (program, args) => {
      const command = program === "restic" ? `restic ${args[0]}` : program;
      calls.push({ command, args });
      if (command === options.failAt) throw new CommandFailure(23);
      if (program === "pg_dump")
        await writeFile(join(stateDir, "work", "database.dump"), dump);
      if (command === "restic backup")
        return JSON.stringify({
          message_type: "summary",
          snapshot_id: snapshot,
        });
      if (command === "restic stats") {
        if (options.statusFailure) await mkdir(join(stateDir, "status.json"));
        return JSON.stringify({
          total_size: options.warning ? 9_000_000_000 : 10,
        });
      }
      if (command === "restic snapshots")
        return JSON.stringify([
          {
            id: snapshot,
            hostname: backupHost,
            tags: options.wrongTag ? [] : [backupTag],
          },
        ]);
      if (program === "psql")
        return args.at(-1).includes("json_build_object")
          ? '{"users":2,"messages":3,"migrations":4}'
          : options.nonempty
            ? "1"
            : "0";
      if (command === "restic restore") {
        const dir = join(stateDir, "work", "restored", "state", "work");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "database.dump"), dump);
        await writeFile(
          join(dir, "manifest.json"),
          JSON.stringify({
            formatVersion: 1,
            postgresMajor: 17,
            database: "newmessenger",
            sha256: options.badDigest
              ? "bad"
              : createHash("sha256").update(dump).digest("hex"),
          }),
        );
      }
      return "";
    },
  };
  return {
    stateDir,
    dependencies,
    calls,
    alerts,
    logs,
    status: async () =>
      JSON.parse(await readFile(join(stateDir, "status.json"), "utf8")),
  };
}

test("configuration rejects insecure/ambiguous repositories and invalid budget", () => {
  for (const repository of [
    "/var/lib/postgresql/data",
    "s3:http://example.test/bucket",
    "s3:https://user:password@example.test/bucket",
  ]) {
    assert.throws(() => loadConfig({ ...env, RESTIC_REPOSITORY: repository }));
  }
  for (const warningBytes of ["0", "-1", "NaN", "10000000000"]) {
    assert.throws(() =>
      loadConfig({ ...env, BACKUP_WARNING_BYTES: warningBytes }),
    );
  }
  assert.throws(() =>
    loadConfig({ ...env, APP_DB_USER: "newmessenger; DROP DATABASE postgres" }),
  );
  assert.throws(() => loadConfig({ ...env, TELEGRAM_CHAT_ID: "" }));
});

test("retention occurs only after upload and full verification; private dump is cleaned", async (t) => {
  const h = await harness(t);
  assert.equal(await operate("backup", env, h.dependencies), 0);
  const names = h.calls.map((c) => c.command);
  assert(names.indexOf("restic check") < names.indexOf("restic forget"));
  const retention = h.calls.find((c) => c.command === "restic forget").args;
  for (const value of [
    backupHost,
    backupTag,
    "--keep-daily",
    "7",
    "--keep-weekly",
    "4",
    "--prune",
  ])
    assert(retention.includes(value));
  assert(!existsSync(join(h.stateDir, "work")));
  assert((await h.status()).lastSuccessfulBackupAt);
  assert.equal(h.alerts.length, 0);
});

for (const failAt of [
  "pg_dump",
  "restic backup",
  "restic check",
  "restic forget",
  "restic stats",
]) {
  test(`${failAt} preserves original failure even if alert delivery fails`, async (t) => {
    const h = await harness(t, { failAt, alertFailure: true });
    assert.equal(await operate("backup", env, h.dependencies), 23);
    const status = await h.status();
    assert.equal(status.exitCode, 23);
    assert.equal(status.alertDelivered, false);
    assert(!existsSync(join(h.stateDir, "work")));
    if (["pg_dump", "restic backup", "restic check"].includes(failAt)) {
      assert(!h.calls.some((c) => c.command === "restic forget"));
    }
    const output = JSON.stringify(h.logs) + h.alerts.join();
    for (const secret of [
      env.RESTIC_PASSWORD,
      env.APP_DB_PASSWORD,
      env.TELEGRAM_BOT_TOKEN,
    ])
      assert(!output.includes(secret));
    assert(!output.includes("credential-bearing URL"));
  });
}

test("status persistence failure is reported as a failed job with an alert", async (t) => {
  const h = await harness(t, { statusFailure: true });
  assert.equal(await operate("backup", env, h.dependencies), 1);
  assert.equal(h.logs.at(-1).exitCode, 1);
  assert.equal(h.logs.at(-1).stage, "status-write");
  assert.match(h.alerts[0], /could not save its status/);
});

test("usage warning is delivered and failed warning delivery is a nonzero job", async (t) => {
  for (const alertFailure of [false, true]) {
    const h = await harness(t, { warning: true, alertFailure });
    assert.equal(
      await operate("backup", env, h.dependencies),
      alertFailure ? 1 : 0,
    );
    assert.match(h.alerts[0], /usage warning/);
    assert.equal((await h.status()).alertDelivered, !alertFailure);
  }
});

for (const options of [
  {},
  { RESTORE_CONFIRM: "newmessenger" },
  { RESTORE_CONFIRM: "newmessenger_restore", RESTORE_SNAPSHOT: "latest" },
]) {
  test(`restore requires explicit isolated destination and full snapshot: ${JSON.stringify(options)}`, async (t) => {
    const h = await harness(t);
    assert.equal(
      await operate("restore", { ...env, ...options }, h.dependencies),
      1,
    );
    assert(!h.calls.some((c) => c.command === "pg_restore"));
  });
}

for (const options of [
  { nonempty: true },
  { wrongTag: true },
  { badDigest: true },
]) {
  test(`restore refuses unsafe input: ${JSON.stringify(options)}`, async (t) => {
    const h = await harness(t, options);
    assert.equal(
      await operate(
        "restore",
        {
          ...env,
          RESTORE_CONFIRM: "newmessenger_restore",
          RESTORE_SNAPSHOT: snapshot,
        },
        h.dependencies,
      ),
      1,
    );
    assert(!h.calls.some((c) => c.command === "pg_restore"));
    assert(!existsSync(join(h.stateDir, "work")));
  });
}

test("restore uses only the isolated host, validates archive and reports restored counts", async (t) => {
  const h = await harness(t);
  assert.equal(
    await operate(
      "restore",
      {
        ...env,
        RESTORE_CONFIRM: "newmessenger_restore",
        RESTORE_SNAPSHOT: snapshot,
      },
      h.dependencies,
    ),
    0,
  );
  const restore = h.calls.find((c) => c.command === "pg_restore");
  assert.equal(restore.args[1], "restore-postgres");
  assert(restore.args.includes("--single-transaction"));
  assert(!restore.args.includes("--clean"));
  assert.deepEqual((await h.status()).restoredCounts, {
    users: 2,
    messages: 3,
    migrations: 4,
  });
});

test("command runner preserves child signals and caller interrupt status", async () => {
  for (const [signal, code] of [
    ["SIGTERM", 143],
    ["SIGKILL", 137],
    ["SIGINT", 130],
  ]) {
    await assert.rejects(
      execute(process.execPath, [
        "-e",
        `process.kill(process.pid, '${signal}')`,
      ]),
      (error) => error.exitCode === code,
    );
  }
  const controller = new AbortController();
  controller.abort(130);
  await assert.rejects(
    execute(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      signal: controller.signal,
    }),
    (error) => error.exitCode === 130,
  );
});

test("command runner bounds execution and does not expose stderr or arguments", async () => {
  await assert.rejects(
    execute(process.execPath, [
      "-e",
      "process.stderr.write('private-value'); process.exit(19)",
    ]),
    (e) => e.exitCode === 19 && !String(e).includes("private-value"),
  );
  await assert.rejects(
    execute(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeout: 30,
    }),
    (e) => e.exitCode === 124,
  );
  await assert.rejects(
    execute("/missing-newmessenger-tool", []),
    (e) => e.exitCode === 127,
  );
});
