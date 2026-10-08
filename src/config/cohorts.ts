import { daySelection } from "./daySelection.js";
import { PursuitReadError } from "../pursuit/errors.js";

// L2 is current. Add L3's verified full name when the transition occurs.
// L1 is historical only; do not infer a future cohort's month from L2.
export const activeCohorts = ["L2 - September 2026"] as const;

export function cohortCandidates(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const current = daySelection({ ...env, PURSUIT_DAY_ID: "1" }).cohort;
  const alternatives =
    env.PURSUIT_COHORT_CANDIDATES !== undefined
      ? env.PURSUIT_COHORT_CANDIDATES.trim() === ""
        ? []
        : env.PURSUIT_COHORT_CANDIDATES.split(",").map((value) => value.trim())
      : activeCohorts.includes(current as (typeof activeCohorts)[number])
        ? [...activeCohorts]
        : [];
  if (alternatives.length > 3) throw new PursuitReadError("DISCOVERY");
  for (const cohort of alternatives)
    daySelection({ PURSUIT_DAY_ID: "1", PURSUIT_COHORT: cohort });
  return [...new Set([current, ...alternatives])];
}
