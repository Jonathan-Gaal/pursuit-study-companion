import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { open, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { projectRoot } from "./config/index.js";
import { startWatchdog } from "./config/watchdog.js";
import { ensureOutputDir } from "./state/store.js";

async function main() {
  await ensureOutputDir(projectRoot, ".runtime");
  const lockPath = resolve(projectRoot, ".runtime/study-run.lock");
  const lock = await open(
    lockPath,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    // The parent owns the lock and watchdog, independently of the daily worker.
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("./dailyCommand.ts", import.meta.url)),
        ...process.argv.slice(2),
      ],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: { ...process.env, TSX_DISABLE_CACHE: "1" },
      },
    );
    const cancel = startWatchdog(() => {
      console.error(
        "Run deadline exceeded; process stopped. No Pursuit submissions were attempted.",
      );
      child.kill("SIGKILL");
    });
    const interrupt = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    try {
      process.exitCode = await new Promise<number>((resolve) => {
        child.once("error", () => {
          console.error("Could not start the local daily worker.");
          resolve(1);
        });
        child.once("close", (code) => resolve(code ?? 1));
      });
    } finally {
      cancel();
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
main().catch(() => {
  console.error(
    "Could not start the study run. Check local state and whether another study run is active.",
  );
  process.exitCode = 1;
});
