export type DaySort = "oldest" | "newest";

/** ISO calendar dates sort chronologically without timezone conversion. */
export function sequenceDays<T extends { date: string }>(
  days: readonly T[],
  order: DaySort = "newest",
): T[] {
  return [...days].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) *
      (order === "newest" ? -1 : 1),
  );
}
