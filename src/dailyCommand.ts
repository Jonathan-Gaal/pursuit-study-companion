import { HistoryStore } from "./history/store.js";
import { loadLocalEnvironment } from "./config/environment.js";
import { PursuitReadError } from "./pursuit/errors.js";
import { parseArgs } from "./config/index.js";
import { dailyRun } from "./dailyRun.js";
try {
  const config = parseArgs(process.argv.slice(2));
  if (config.mode === "live") await loadLocalEnvironment();
  const history = new HistoryStore(config.root);
  const runId =
    process.env.PURSUIT_DASHBOARD_RUN_ID ??
    history.startRun(
      "study",
      process.env.PURSUIT_RUN_SOURCE ?? config.mode ?? "live",
    );
  let result;
  try {
    result = await dailyRun(config);
    history.finishRun(
      runId,
      result.errors.length ? "ERROR" : "FINISHED",
      result.report,
      result.date,
    );
  } catch (error) {
    history.finishRun(runId, "ERROR", "Study run failed safely.");
    throw error;
  } finally {
    history.close();
  }
  console.log(result.report);
  console.log(`\nStudy note: ${result.note}`);
  if (result.errors.length) process.exitCode = 1;
} catch (error) {
  if (error instanceof PursuitReadError) console.error(error.message);
  else
    console.error(
      "Daily run failed. Check CLI options, fixture schema, and local state. No Pursuit submissions were attempted.",
    );
  process.exitCode = 1;
}
