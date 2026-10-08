import { validDate } from "./parser.js";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const type = (value: unknown) =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

/** Fixed fields only. Never return task bodies, arbitrary keys, tokens or raw errors. */
export function curriculumDiagnostic(raw: unknown) {
  const envelope = object(raw) ? raw : {};
  const day = object(envelope.day) ? envelope.day : {};
  const candidate = day.date ?? day.day_date;
  const date =
    typeof candidate === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(candidate) &&
    Number.isFinite(Date.parse(candidate))
      ? candidate.slice(0, 10)
      : candidate;
  return {
    envelopeType: type(raw),
    dayType: type(envelope.day),
    returnedDayId:
      Number.isSafeInteger(day.id) && Number(day.id) > 0 ? day.id : null,
    idType: type(day.id),
    returnedCohort:
      typeof day.cohort === "string" &&
      /^L[1-9]\d? - [A-Za-z]+ 20\d{2}$/.test(day.cohort)
        ? day.cohort
        : null,
    cohortType: type(day.cohort),
    returnedDate: validDate(date) ? date : null,
    dateType: type(candidate),
    flattenedTasksType: type(envelope.flattenedTasks),
    flattenedTaskCount: Array.isArray(envelope.flattenedTasks)
      ? envelope.flattenedTasks.length
      : null,
    timeBlocksType: type(envelope.timeBlocks),
    timeBlockCount: Array.isArray(envelope.timeBlocks)
      ? envelope.timeBlocks.length
      : null,
  };
}
