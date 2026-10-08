export type ProtectedKind = "ASSESSMENT" | "WEEKLY_SURVEY";
const assessment = /assessment/i;
const weeklySurvey = /weekly[\s_-]*survey/i;
const meaningful = (value: unknown): boolean =>
  value != null && value !== false && value !== "";
/** Only explicit metadata is inspected. Questions, lesson content, answers and descriptions are excluded. */
export function detectProtection(
  raw: Record<string, unknown>,
): ProtectedKind | null {
  for (const [key, value] of Object.entries(raw)) {
    if (/assessment/i.test(key) && meaningful(value)) return "ASSESSMENT";
  }
  const candidates: unknown[] = [
    "title",
    "task_title",
    "type",
    "task_type",
    "task_mode",
    "taskMode",
    "intent",
    "task_intent",
    "v2_task_intent",
    "survey_type",
    "category",
    "kind",
  ].map((key) => raw[key]);
  if (
    raw.assessment_id != null ||
    meaningful(raw.is_assessment) ||
    meaningful(raw.isAssessment) ||
    meaningful(raw.assessment)
  )
    return "ASSESSMENT";
  const explicitWeekly = Object.entries(raw).some(
    ([key, value]) => /weekly[_-]?survey/i.test(key) && meaningful(value),
  );
  let isWeekly =
    explicitWeekly ||
    raw.weekly_survey_id != null ||
    meaningful(raw.is_weekly_survey) ||
    meaningful(raw.isWeeklySurvey) ||
    meaningful(raw.weekly_survey);
  let isAssessment = false;
  let visited = 0;
  function inspect(value: unknown, depth = 0): void {
    if (++visited > 20000 || depth > 12)
      throw new Error("Protection metadata exceeds safety limits");
    if (typeof value === "string") {
      isAssessment ||= assessment.test(value);
      isWeekly ||= weeklySurvey.test(value);
    } else if (Array.isArray(value))
      for (const item of value) inspect(item, depth + 1);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) {
        if (
          (/assessment[_-]?id/i.test(key) && item != null) ||
          (/assessment/i.test(key) && meaningful(item))
        )
          isAssessment = true;
        if (/weekly[_-]?survey/i.test(key) && meaningful(item)) isWeekly = true;
        // Only metadata nodes reach this function; nested question/answer bodies remain excluded.
        if (!/question|answer|lesson|description|content/i.test(key))
          inspect(item, depth + 1);
      }
  }
  for (const candidate of candidates) inspect(candidate);
  for (const key of ["metadata", "task_metadata", "flags"]) inspect(raw[key]);
  if (isAssessment) return "ASSESSMENT";
  return isWeekly ? "WEEKLY_SURVEY" : null;
}
