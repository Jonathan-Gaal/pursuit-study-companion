import { PursuitReadError } from "../pursuit/errors.js";
export function localCalendarDate(
  now: Date = new Date(),
  timeZone?: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) =>
      parts.find((part) => part.type === type)!.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    throw new PursuitReadError("DISCOVERY");
  }
}
export interface DatedDay {
  dayId: number;
  date: string;
}
export class NoScheduledDayError extends PursuitReadError {
  constructor(date: string) {
    super("DISCOVERY");
    this.message = `No Pursuit day scheduled for ${date} among verified day IDs and the bounded forward preflight range.`;
  }
}
export function exactDate<T extends DatedDay>(days: T[], date: string): T {
  const matching = days.filter((day) => day.date === date);
  if (!matching.length) throw new NoScheduledDayError(date);
  if (matching.length !== 1) throw new PursuitReadError("SCHEMA");
  return matching[0]!;
}
