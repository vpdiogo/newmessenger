import { spawn } from "node:child_process";
import { constants } from "node:os";

export class CommandFailure extends Error {
  constructor(code) {
    super("Operational command failed");
    this.exitCode = code;
  }
}

export function execute(
  program,
  args,
  { env, signal, timeout = 1_800_000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let failure;
    let killTimer;
    const stop = (code) => {
      failure ??= code;
      child.kill("SIGTERM");
      killTimer ??= setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    const abort = () => stop(signal?.reason === 130 ? 130 : 143);
    const timer = setTimeout(() => stop(124), timeout);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on("data", (chunk) => {
      if (output.length + chunk.length > 4 * 1024 * 1024) stop(1);
      else output += chunk;
    });
    child.stderr.resume();
    child.on("error", () => {
      failure ??= 127;
    });
    child.on("close", (code, signalName) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      const signalCode = constants.signals[signalName];
      const exitCode = failure ?? code ?? (signalCode ? 128 + signalCode : 1);
      if (exitCode) reject(new CommandFailure(exitCode));
      else resolve(output);
    });
  });
}
