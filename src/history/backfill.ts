import { validDate } from "../pursuit/parser.js";
import { daySelection, type DaySelection } from "../config/daySelection.js";
import {
  CurriculumCohortMismatchError,
  PursuitReadError,
} from "../pursuit/errors.js";
import type { Day } from "../types/index.js";

export interface BackfillOptions {
  from: string;
  through: string;
  minDay: number;
  maxDay: number;
  cohorts: string[];
}
export interface BackfillDependencies {
  load(selection: DaySelection): Promise<Day>;
  save(day: Day, selection: DaySelection): Promise<void>;
  progress(message: string): void;
}

/** An explicit, bounded historical scan. No conversations or submission dependencies. */
export async function backfillHistory(
  options: BackfillOptions,
  dependencies: BackfillDependencies,
) {
  const { from, through, minDay, maxDay, cohorts } = options;
  if (
    !validDate(from) ||
    !validDate(through) ||
    from > through ||
    !Number.isSafeInteger(minDay) ||
    !Number.isSafeInteger(maxDay) ||
    minDay <= 0 ||
    maxDay < minDay ||
    !cohorts.length ||
    cohorts.length > 3 ||
    new Set(cohorts).size !== cohorts.length ||
    (maxDay - minDay + 1) * cohorts.length > 500
  )
    throw new Error(
      "Invalid backfill range; maximum 500 candidate GETs per run.",
    );
  for (const cohort of cohorts)
    daySelection({ PURSUIT_DAY_ID: String(minDay), PURSUIT_COHORT: cohort });
  const dates = new Map<string, number>();
  let unavailable = 0;
  for (let dayId = maxDay; dayId >= minDay; dayId--) {
    for (const cohort of cohorts) {
      const selection = { dayId, cohort };
      let day: Day;
      try {
        day = await dependencies.load(selection);
      } catch (error) {
        if (
          error instanceof CurriculumCohortMismatchError &&
          cohorts.includes(error.returnedCohort) &&
          error.returnedCohort !== cohort
        ) {
          unavailable++;
          continue;
        }
        if (error instanceof PursuitReadError && error.code === "NO_DAY") {
          unavailable++;
          continue;
        }
        // Authentication, quota, transport and schema failures stop the scan without retry.
        dependencies.progress(
          `Stopped reading curriculum day ${dayId}, requested cohort ${cohort}.`,
        );
        throw error;
      }
      if (
        day.source !== "live" ||
        day.dayId !== dayId ||
        day.cohort !== cohort ||
        !validDate(day.date)
      )
        throw new PursuitReadError("SCHEMA");
      if (day.date < from || day.date > through) break;
      if (dates.has(day.date)) throw new PursuitReadError("SCHEMA");
      try {
        await dependencies.save(day, selection);
      } catch (error) {
        dependencies.progress(
          `Stopped importing ${day.date}, day ${dayId}, cohort ${cohort}. Previously saved days are retained.`,
        );
        throw error;
      }
      dates.set(day.date, dayId);
      dependencies.progress(
        `${day.date}: imported day ${dayId} (${day.tasks.length} assignments).`,
      );
      // A verified day has one matching cohort. Do not query it again under L1/L2.
      break;
    }
  }
  return {
    dates: [...dates.keys()].sort(),
    unavailable,
    reachedStart: dates.has(from),
  };
}
