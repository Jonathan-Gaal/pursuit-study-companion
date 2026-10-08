/** Platform day route supplied by Jonathan; no individual-task route is verified. */
export function pursuitDayUrl(day: {
  source: string;
  day_id: number | null;
  tasks: { cohort?: string | null }[];
}): string | null {
  if (
    day.source !== "live" ||
    !Number.isSafeInteger(day.day_id) ||
    !day.day_id ||
    day.day_id <= 0
  )
    return null;
  const cohorts = new Set(
    day.tasks
      .map((task) => task.cohort)
      .filter(
        (cohort): cohort is string =>
          typeof cohort === "string" && cohort.trim().length > 0,
      ),
  );
  if (cohorts.size !== 1) return null;
  const url = new URL("https://platform.pursuit.org/learning");
  url.searchParams.set("dayId", String(day.day_id));
  url.searchParams.set("cohort", [...cohorts][0]!);
  return url.href;
}
