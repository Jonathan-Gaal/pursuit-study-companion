import { loadLocalEnvironment } from "./config/environment.js";
import { daySelection, fullDetailsPath } from "./config/daySelection.js";
import { ReadOnlyHttpClient } from "./pursuit/http.js";
import { EnvironmentTokenSource } from "./pursuit/auth.js";
import { curriculumDiagnostic } from "./pursuit/curriculumDiagnostic.js";
import { PursuitReadError } from "./pursuit/errors.js";

async function main() {
  await loadLocalEnvironment();
  const args = process.argv.slice(2);
  let id: string | undefined;
  let minDay: string | undefined;
  let maxDay: string | undefined;
  const cohorts: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value || value.startsWith("--")) throw new Error("Invalid arguments");
    if (args[i] === "--day" && id === undefined) id = value;
    else if (args[i] === "--min-day" && minDay === undefined) minDay = value;
    else if (args[i] === "--max-day" && maxDay === undefined) maxDay = value;
    else if (args[i] === "--cohort") cohorts.push(value);
    else throw new Error("Invalid arguments");
  }
  if (!cohorts.length || cohorts.length > 3)
    throw new Error("Invalid arguments");
  const first = daySelection({
    PURSUIT_DAY_ID: id ?? minDay,
    PURSUIT_COHORT: cohorts[0],
  });
  const last = daySelection({
    PURSUIT_DAY_ID: id ?? maxDay,
    PURSUIT_COHORT: cohorts[0],
  });
  if (
    (id !== undefined && (minDay !== undefined || maxDay !== undefined)) ||
    last.dayId < first.dayId ||
    (last.dayId - first.dayId + 1) * cohorts.length > 50
  )
    throw new Error("Invalid inspection range");
  const selections = Array.from(
    { length: last.dayId - first.dayId + 1 },
    (_, index) =>
      cohorts.map((cohort) =>
        daySelection({
          PURSUIT_DAY_ID: String(first.dayId + index),
          PURSUIT_COHORT: cohort,
        }),
      ),
  ).flat();
  for (const selection of selections) {
    // Labels identify explicit local selection, never server-controlled content.
    console.log(
      `Inspecting day ${selection.dayId}, configured cohort #${cohorts.indexOf(selection.cohort) + 1}:`,
    );
    try {
      const raw = await new ReadOnlyHttpClient(
        new EnvironmentTokenSource(),
      ).request("GET", fullDetailsPath(selection));
      console.log(JSON.stringify(curriculumDiagnostic(raw), null, 2));
    } catch (error) {
      if (error instanceof PursuitReadError && error.code === "NO_DAY") {
        console.log(error.message);
        continue;
      }
      throw error;
    }
  }
  console.log(
    "Read-only inspection. No tasks, study notes or completion state changed.",
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof PursuitReadError
      ? error.message
      : "Inspection stopped. Use --day DAY_ID or --min-day ID --max-day ID, plus verified --cohort names. Maximum 50 GETs.",
  );
  process.exitCode = 1;
});
