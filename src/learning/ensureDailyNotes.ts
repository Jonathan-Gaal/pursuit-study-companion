import { open, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { dailyRun } from "../dailyRun.js";
import { ensureOutputDir } from "../state/store.js";
import { HistoryStore } from "../history/store.js";
import type { Day } from "../types/index.js";

/** Use the study import's verified day, without Pursuit writes. */
export async function ensureDailyNotes(root: string, day: Day) {
  await ensureOutputDir(root, ".runtime");
  const path = resolve(root, ".runtime/study-run.lock");
  const lock = await open(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  let history: HistoryStore | undefined;
  let runId: string | undefined;
  try {
    history = new HistoryStore(root);
    runId = history.startRun(
      "study",
      process.env.PURSUIT_RUN_SOURCE ?? "study import",
      day.date,
    );
    const result = await dailyRun(
      {
        dryRun: true,
        root,
        mode: day.source === "live" ? "live" : "fixture",
        fixturePath: "",
      },
      { loadDay: async () => day },
    );
    history.finishRun(
      runId,
      result.errors.length ? "ERROR" : "FINISHED",
      result.report,
      day.date,
    );
    if (result.errors.length)
      throw new Error(
        "Study notes reported errors; study import did not start.",
      );
    return result;
  } catch (error) {
    if (history && runId && history.runningRun(runId))
      history.finishRun(
        runId,
        "ERROR",
        "Study notes failed safely; study import did not start.",
        day.date,
      );
    throw error;
  } finally {
    history?.close();
    await lock.close();
    await unlink(path);
  }
}
