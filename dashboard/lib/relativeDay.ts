const calendarDay = (year: number, month: number, day: number) =>
  Date.UTC(year, month, day) / 86_400_000;

/** Compare local calendar dates, so daylight-saving changes do not shift labels. */
export function relativeDay(date: string, now: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !Number.isFinite(now.getTime())) return date;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  )
    return date;
  const difference =
    calendarDay(now.getFullYear(), now.getMonth(), now.getDate()) -
    calendarDay(year, month, day);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference > 1) return `${difference} days ago`;
  if (difference === -1) return "Tomorrow";
  return `In ${-difference} days`;
}
