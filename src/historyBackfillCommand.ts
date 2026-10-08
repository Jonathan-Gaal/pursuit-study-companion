import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalEnvironment } from "./config/environment.js";
import { projectRoot } from "./config/index.js";
import { localCalendarDate } from "./config/calendar.js";
import { backfillHistory } from "./history/backfill.js";
import { LivePursuitClient } from "./pursuit/liveClient.js";
import { enrichCompletion } from "./pursuit/completion.js";
import { PursuitReadError } from "./pursuit/errors.js";
import { dailyRun } from "./dailyRun.js";
import { HistoryStore } from "./history/store.js";
import { ensureOutputDir } from "./state/store.js";

async function main() {
  await loadLocalEnvironment();
  const values: Record<string, string> = {};
  const cohorts: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!;
    const value = args[i + 1];
    if (
      !value ||
      value.startsWith("--") ||
      !["--from", "--through", "--min-day", "--max-day", "--cohort"].includes(
        key,
      )
    )
      throw new Error("Invalid backfill arguments.");
    if (key === "--cohort") cohorts.push(value);
    else {
      if (values[key] !== undefined)
        throw new Error("Duplicate backfill argument.");
      values[key] = value;
    }
  }
  const options = {
    from: values["--from"] ?? "",
    through:
      values["--through"] ??
      localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE),
    minDay: Number(values["--min-day"]),
    maxDay: Number(values["--max-day"]),
    cohorts,
  };
  if (
    options.through >
    localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE)
  )
    throw new Error("Historical backfills cannot select future dates.");
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
  let history: HistoryStore | undefined;
  try {
    history = new HistoryStore(projectRoot);
    const store = history;
    const result = await backfillHistory(options, {
      load: (selection) =>
        new LivePursuitClient().loadDefinitions(selection, options.cohorts),
      save: async (day, selection) => {
        const reader = new LivePursuitClient(undefined, selection);
        const enriched = await enrichCompletion(
          { ...day, selection: "historical" },
          reader,
        );
        const runId = store.startRun("study", "historical-backfill");
        try {
          const result = await dailyRun(
            { dryRun: true, mode: "live", fixturePath: "", root: projectRoot },
            { loadDay: async () => enriched },
          );
          store.finishRun(
            runId,
            result.errors.length ? "ERROR" : "FINISHED",
            result.report,
            result.date,
          );
          for (const error of result.errors) console.log(error);
        } catch (error) {
          store.finishRun(
            runId,
            "ERROR",
            "Historical import stopped safely.",
            day.date,
          );
          throw error;
        }
        if (enriched.tasks.some((task) => task.completionReadFailed))
          throw new Error(
            "Completion reads failed; day saved with UNKNOWN status. Scan stopped.",
          );
      },
      progress: (message) => console.log(message),
    });
    console.log(
      `${result.dates.length} days imported. ${result.unavailable} unavailable candidate GETs. Existing notes preserved. No Pursuit writes or external AI calls.`,
    );
    if (!result.reachedStart) {
      console.log(
        `The requested earliest date ${options.from} was not found. This is a partial backfill; verify the ID range and cohort names.`,
      );
      process.exitCode = 1;
    }
  } finally {
    history?.close();
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof PursuitReadError
      ? error.message
      : "Historical backfill stopped. Check the explicit date/ID range, verified cohort names, local configuration, network and study lock. Previously imported days are retained.",
  );
  process.exitCode = 1;
});
