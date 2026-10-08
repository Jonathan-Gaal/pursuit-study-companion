import { resolve } from "node:path";
import { HistoryStore } from "./history/store.js";
import {
  backfillSavedResources,
  resourcesOverview,
} from "./history/resources.js";
import { refreshHistoricalDay } from "./history/refresh.js";
import { loadLocalEnvironment } from "./config/environment.js";
import { PursuitReadError } from "./pursuit/errors.js";

// This command indexes local curriculum by default. --live performs verified GETs only.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--live"))
  throw new Error("Usage: npm run resources:sync -- [--live]");
await loadLocalEnvironment();
const root = resolve(process.cwd());
const history = new HistoryStore(root);
try {
  const result = await backfillSavedResources(root, history);
  console.log(
    `Indexed saved curriculum for ${result.indexedTasks} assignments.`,
  );
  for (const warning of result.warnings) console.log(warning);
  if (args.includes("--live")) {
    for (const day of history.listDays()) {
      if (day.source !== "live" || !day.day_id) {
        console.log(
          `${day.date}: saved curriculum indexed; verified live identity is unavailable.`,
        );
        continue;
      }
      try {
        await refreshHistoricalDay(root, history, String(day.date));
        console.log(
          `${day.date}: refreshed resources from verified Pursuit GETs.`,
        );
      } catch (error) {
        console.log(
          error instanceof PursuitReadError
            ? error.message
            : "Resource refresh failed; saved curriculum retained.",
        );
        break;
      }
    }
  }
  const { entries } = resourcesOverview(history);
  console.log(
    `${entries.length} assignments with resources or deliverables saved. No AI calls or Pursuit writes.`,
  );
} finally {
  history.close();
}
