import { loadLocalEnvironment } from "./config/environment.js";
import { localCalendarDate } from "./config/calendar.js";
import { projectRoot } from "./config/index.js";
import { LivePursuitClient } from "./pursuit/liveClient.js";
import { loadDiscoveredDays } from "./pursuit/dayDiscovery.js";
import { PursuitReadError } from "./pursuit/errors.js";

try {
  await loadLocalEnvironment();
  const date = localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE);
  const day = await new LivePursuitClient().loadDay();
  const upcoming = (await loadDiscoveredDays(projectRoot, date))
    .filter((item) => item.date > date)
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(
    JSON.stringify(
      {
        status: "PREFLIGHT_COMPLETE",
        today: {
          date: day.date,
          dayId: day.dayId,
          taskCount: day.tasks.length,
        },
        upcoming,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof PursuitReadError
      ? error.message
      : "Preflight stopped. No Pursuit submissions or study-note changes were made.",
  );
  process.exitCode = 1;
}
