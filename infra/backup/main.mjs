import { readFile } from "node:fs/promises";
import { operate } from "./operations.mjs";

process.umask(0o077);
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort(143));
process.once("SIGINT", () => controller.abort(130));
const action = process.argv[2] || "backup";
if (
  process.argv.length > 3 ||
  !["init", "backup", "restore", "snapshots", "test-alert", "status"].includes(
    action,
  )
) {
  console.error("Use init, backup, restore, snapshots, test-alert or status");
  process.exitCode = 2;
} else if (action === "status") {
  try {
    console.log(await readFile("/state/status.json", "utf8"));
  } catch {
    console.error("No recorded backup job status");
    process.exitCode = 1;
  }
} else {
  process.exitCode = await operate(action, process.env, {
    signal: controller.signal,
  });
}
