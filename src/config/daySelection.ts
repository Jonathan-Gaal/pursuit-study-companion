import { limits } from "./limits.js";
import { PursuitReadError } from "../pursuit/errors.js";
export interface DaySelection {
  dayId: number;
  cohort: string;
}
export function daySelection(
  env: Record<string, string | undefined> = process.env,
): DaySelection {
  const id = env.PURSUIT_DAY_ID;
  const cohort = env.PURSUIT_COHORT?.trim();
  if (
    !id ||
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !cohort ||
    cohort.length > 200 ||
    /[\r\n\x00]/.test(cohort)
  )
    throw new PursuitReadError("DISCOVERY");
  return { dayId: Number(id), cohort };
}
export function fullDetailsPath(selection: DaySelection): string {
  // Revalidate injected selections as well as environment configuration.
  const validated = daySelection({
    PURSUIT_DAY_ID: String(selection.dayId),
    PURSUIT_COHORT: selection.cohort,
  });
  return `/api/curriculum/days/${validated.dayId}/full-details?cohort=${encodeURIComponent(validated.cohort)}`;
}

/** Parse configured confirmed anchors; live selection adds a bounded forward scan. */
export function configuredDayIds(
  env: Record<string, string | undefined> = process.env,
): number[] {
  const values = (env.PURSUIT_DAY_IDS ?? env.PURSUIT_DAY_ID ?? "")
    .split(",")
    .map((value) => value.trim());
  if (
    !values.length ||
    values.length > limits.maxDays ||
    values.some(
      (value) =>
        !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)),
    )
  )
    throw new PursuitReadError("DISCOVERY");
  return [...new Set(values.map(Number))];
}
