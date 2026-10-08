import { detectProtection } from "./protection.js";
import { limits } from "../config/limits.js";
import type { Day, Task } from "../types/index.js";
import { extractTaskAssets } from "../learning/taskAssets.js";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const textFields = [
  "title",
  "description",
  "resources",
  "deliverable",
  "deliverable_schema",
  "intro",
  "questions",
  "conclusion",
  "v2_learning_goal",
  "v2_lesson_content",
  "v2_competency_criteria",
  "v2_skill_tags",
  "v2_task_intent",
];
function strings(
  value: unknown,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): string[] {
  if (++budget.nodes > limits.maxNodes || depth > limits.maxDepth)
    throw new Error("Task input exceeds complexity limits");
  if (typeof value === "string") {
    budget.chars += value.length;
    if (budget.chars > limits.maxTextChars)
      throw new Error("Task text exceeds size limit");
    return [value];
  }
  if (Array.isArray(value))
    return value.flatMap((item) => strings(item, depth + 1, budget));
  if (record(value))
    return Object.values(value).flatMap((item) =>
      strings(item, depth + 1, budget),
    );
  return [];
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function parseDay(input: unknown): Day {
  if (!record(input))
    throw new Error("Unknown curriculum schema: expected object");
  const candidate = record(input.day)
    ? (input.day.date ?? input.day.day_date)
    : input.date;
  const date =
    typeof candidate === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(candidate) &&
    Number.isFinite(Date.parse(candidate))
      ? candidate.slice(0, 10)
      : candidate;
  if (!validDate(date))
    throw new Error("Curriculum requires a valid YYYY-MM-DD date");
  const warnings: string[] = [];
  const nestedMetadata = new Map<number, Record<string, unknown>[]>();
  if (Array.isArray(input.timeBlocks)) {
    if (input.timeBlocks.length > limits.maxTasks)
      throw new Error("Time block count exceeds safety limit");
    let count = 0;
    for (const block of input.timeBlocks)
      if (record(block) && Array.isArray(block.tasks)) {
        for (const item of block.tasks)
          if (record(item)) {
            if (++count > limits.maxTasks)
              throw new Error("Daily task count exceeds safety limit");
            const id = item.id ?? item.task_id;
            if (Number.isSafeInteger(id))
              nestedMetadata.set(Number(id), [
                ...(nestedMetadata.get(Number(id)) ?? []),
                item,
              ]);
          }
      }
  }
  let raw: unknown[];
  if (Array.isArray(input.flattenedTasks)) raw = input.flattenedTasks;
  else if (Array.isArray(input.timeBlocks)) {
    raw = [];
    if (input.timeBlocks.length > limits.maxTasks)
      throw new Error("Time block count exceeds safety limit");
    for (const block of input.timeBlocks) {
      if (!record(block)) {
        warnings.push("Malformed time block skipped");
        continue;
      }
      if (Array.isArray(block.tasks)) {
        if (raw.length + block.tasks.length > limits.maxTasks)
          throw new Error("Daily task count exceeds safety limit");
        raw.push(...block.tasks);
      } else if (/^(lunch|break)$/i.test(String(block.type ?? block.title)))
        raw.push(block);
      else warnings.push("Unknown time block task schema skipped");
    }
  } else throw new Error("Unknown curriculum schema: no task collection");
  if (raw.length > limits.maxTasks)
    throw new Error("Daily task count exceeds safety limit");
  const tasks: Task[] = [];
  const seen = new Set<number>();
  const conflicted = new Set<number>();
  for (const source of raw) {
    const value = record(source)
      ? {
          ...(nestedMetadata.get(Number(source.id ?? source.task_id))?.[0] ??
            {}),
          ...source,
          id: source.id ?? source.task_id,
          title: source.title ?? source.task_title,
          description: source.description ?? source.task_description,
          type: source.type ?? source.task_type,
          resources: source.resources ?? source.linked_resources,
        }
      : source;
    if (
      !record(value) ||
      !Number.isSafeInteger(value.id) ||
      Number(value.id) <= 0 ||
      typeof value.title !== "string" ||
      !value.title.trim()
    ) {
      warnings.push("Invalid task identity skipped; no action taken");
      continue;
    }
    const id = Number(value.id);
    if (seen.has(id)) {
      conflicted.add(id);
      warnings.push(`Duplicate task ${id}: requires user review`);
      continue;
    }
    seen.add(id);
    let protectedKind = detectProtection(value);
    for (const alternate of nestedMetadata.get(id) ?? []) {
      const alternateKind = detectProtection(alternate);
      if (alternateKind === "ASSESSMENT" || protectedKind === "ASSESSMENT")
        protectedKind = "ASSESSMENT";
      else protectedKind ??= alternateKind;
    }
    const dt = value.deliverable_type;
    const malformedArtifact = [
      "deliverable",
      "deliverable_type",
      "deliverable_schema",
    ].some(
      (key) =>
        value[key] != null && !["string", "object"].includes(typeof value[key]),
    );
    let text = "";
    let oversized = false;
    try {
      if (!protectedKind)
        text = strings(
          Object.fromEntries(textFields.map((key) => [key, value[key]])),
        ).join("\n");
    } catch {
      oversized = true;
      warnings.push(
        `Task ${id} exceeds text/complexity limits: requires user review`,
      );
    }
    const task: Task = {
      taskIntent: protectedKind
        ? null
        : typeof value.v2_task_intent === "string"
          ? value.v2_task_intent
          : null,
      taskMode:
        typeof value.task_mode === "string"
          ? value.task_mode.toLowerCase()
          : null,
      protectedKind,
      id,
      title: value.title.trim().slice(0, 500),
      text,
      type: typeof value.type === "string" ? value.type.toLowerCase() : "",
      deliverableType:
        typeof dt === "string" && dt.trim() ? dt.trim().toLowerCase() : null,
      deliverableEvidence:
        !!value.deliverable ||
        !!value.deliverable_schema ||
        (!!dt && dt !== "none") ||
        value.analyze_deliverable === true,
      uncertain:
        oversized ||
        malformedArtifact ||
        (dt != null && typeof dt !== "string"),
      completed: typeof value.completed === "boolean" ? value.completed : null,
    };
    try {
      task.assets = extractTaskAssets(task, [
        value,
        ...(nestedMetadata.get(id) ?? []),
      ]);
    } catch {
      task.uncertain = true;
      warnings.push(`Task ${id}: resource metadata requires review`);
    }
    tasks.push(task);
  }
  for (const task of tasks) if (conflicted.has(task.id)) task.uncertain = true;
  return { date, tasks, warnings };
}
