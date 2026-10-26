import type { Day } from "../types/index.js";
import type { DaySelection } from "../config/daySelection.js";
import { daySelection } from "../config/daySelection.js";
import { validDate } from "../pursuit/parser.js";
import {
  CurriculumCohortMismatchError,
  CurriculumUnavailableError,
  PursuitReadError,
} from "../pursuit/errors.js";

export interface SavedAnchor {
  date: string;
  dayId: number;
  cohort: string;
}

/** Bounded verified-GET discovery. Calendar gaps are never fabricated as lessons. */
export async function catchUpDays(options: {
  today: string;
  anchors: SavedAnchor[];
  load(selection: DaySelection, cohorts: string[]): Promise<Day>;
  save(day: Day, selection: DaySelection): Promise<void>;
  progress(message: string): void;
}) {
  const { today, anchors } = options;
  if (!validDate(today) || !anchors.length)
    throw new PursuitReadError("DISCOVERY");
  for (const anchor of anchors) {
    if (!validDate(anchor.date)) throw new PursuitReadError("SCHEMA");
    daySelection({
      PURSUIT_DAY_ID: String(anchor.dayId),
      PURSUIT_COHORT: anchor.cohort,
    });
  }
  const past = anchors.filter((a) => a.date <= today);
  if (!past.length) throw new PursuitReadError("DISCOVERY");
  const first = past.reduce((a, b) => (a.date < b.date ? a : b));
  const latest = past.reduce((a, b) => (a.dayId > b.dayId ? a : b));
  const elapsed = Math.ceil(
    (Date.parse(today) - Date.parse(latest.date)) / 86400000,
  );
  const end = latest.dayId + Math.max(50, elapsed * 2);
  const known = new Set(anchors.map((a) => a.dayId));
  const cohorts = [
    ...new Set(
      [...anchors]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => a.cohort),
    ),
  ];
  if (cohorts.length > 3 || !Number.isSafeInteger(end))
    throw new PursuitReadError("LIMIT");
  const ids: number[] = [];
  // Interior gaps first, even when today's entry already exists.
  for (let id = first.dayId; id <= end; id++) {
    if (!known.has(id)) ids.push(id);
    if (ids.length * cohorts.length > 500) throw new PursuitReadError("LIMIT");
  }
  const currentStart = Math.min(
    ...past.filter((a) => a.cohort === latest.cohort).map((a) => a.dayId),
  );
  // Catch up recent missed classes before scanning older historical gaps.
  // This also preserves useful new entries if an old candidate later fails.
  ids.sort((a, b) => {
    const priority = (id: number) =>
      id > latest.dayId ? 0 : id >= currentStart ? 1 : 2;
    return priority(a) - priority(b) || a - b;
  });
  let imported = 0;
  let reads = 0;
  let inaccessible = 0;
  const dates = new Map(past.map((a) => [a.date, a.dayId]));
  for (const dayId of ids) {
    for (const cohort of cohorts) {
      let day: Day;
      try {
        reads++;
        day = await options.load({ dayId, cohort }, cohorts);
      } catch (error) {
        if (
          error instanceof CurriculumCohortMismatchError &&
          cohorts.includes(error.returnedCohort)
        )
          continue;
        // IDs are shared across curricula. A denied candidate is unresolved,
        // not an authentication failure or evidence of a missing calendar day.
        if (
          error instanceof CurriculumUnavailableError &&
          error.httpStatus === 403
        ) {
          inaccessible++;
          options.progress(
            `Curriculum ID ${dayId} is inaccessible for this cohort; continuing the bounded scan.`,
          );
          continue;
        }
        if (error instanceof PursuitReadError && error.code === "NO_DAY")
          continue;
        throw error;
      }
      if (
        day.source !== "live" ||
        day.dayId !== dayId ||
        day.cohort !== cohort ||
        !validDate(day.date)
      )
        throw new PursuitReadError("SCHEMA");
      if (day.date >= first.date && day.date <= today) {
        if (dates.has(day.date) && dates.get(day.date) !== dayId)
          throw new PursuitReadError("SCHEMA");
        await options.save(day, { dayId, cohort });
        dates.set(day.date, dayId);
        imported++;
        options.progress(
          `Added ${day.date}. ${imported} missing days fetched.`,
        );
      }
      break;
    }
  }
  return { imported, reads, inaccessible };
}
