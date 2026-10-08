import type { Day, Task } from "../types/index.js";
import { PursuitReadError } from "./errors.js";
import { limits } from "../config/limits.js";
import { detectProtection, type ProtectedKind } from "./protection.js";
import { emptyTaskAssets } from "../learning/taskAssets.js";
export interface CompletionStatus {
  isComplete: boolean;
  protectedKind?: ProtectedKind | null;
  reason: string | null;
  taskMode: string | null;
  requiresDeliverable: boolean | null;
  shouldAnalyze: boolean | null;
}
export function parseCompletion(input: unknown): CompletionStatus {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PursuitReadError("SCHEMA");
  const raw = input as Record<string, unknown>;
  if (typeof raw.isComplete !== "boolean") throw new PursuitReadError("SCHEMA");
  for (const key of ["reason", "taskMode"])
    if (raw[key] != null && typeof raw[key] !== "string")
      throw new PursuitReadError("SCHEMA");
  for (const key of ["requiresDeliverable", "shouldAnalyze"])
    if (raw[key] != null && typeof raw[key] !== "boolean")
      throw new PursuitReadError("SCHEMA");
  return {
    protectedKind:
      detectProtection(raw) ??
      (raw.protectedKind === "ASSESSMENT" ||
      raw.protectedKind === "WEEKLY_SURVEY"
        ? raw.protectedKind
        : null),
    isComplete: raw.isComplete,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    taskMode: typeof raw.taskMode === "string" ? raw.taskMode : null,
    requiresDeliverable:
      typeof raw.requiresDeliverable === "boolean"
        ? raw.requiresDeliverable
        : null,
    shouldAnalyze:
      typeof raw.shouldAnalyze === "boolean" ? raw.shouldAnalyze : null,
  };
}
export interface CompletionReader {
  getCompletion(taskId: number): Promise<CompletionStatus>;
}
/** One GET per task, bounded parallelism, no retries. Invalid responses never inherit stale completion. */
export async function enrichCompletion(
  day: Day,
  reader: CompletionReader,
): Promise<Day> {
  const tasks: Task[] = day.tasks.map((task) => ({
    ...task,
    completed: null,
    completionDetails: undefined,
    completionReadFailed: false,
  }));
  const warnings = [...day.warnings];
  let next = 0;
  let blocked = false;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      if (blocked) {
        task.completionReadFailed = true;
        warnings.push(
          `Task ${task.id}: completion UNKNOWN; remaining reads blocked`,
        );
        continue;
      }
      try {
        const status = parseCompletion(await reader.getCompletion(task.id));
        task.completed = status.isComplete;
        task.completionDetails = status;
        const protection =
          status.protectedKind ??
          detectProtection({ task_mode: status.taskMode });
        if (protection) {
          task.protectedKind =
            task.protectedKind === "ASSESSMENT" || protection === "ASSESSMENT"
              ? "ASSESSMENT"
              : (task.protectedKind ?? protection);
          task.text = "";
          task.assets = emptyTaskAssets();
          task.taskIntent = null;
        }
        if (status.requiresDeliverable === true)
          task.deliverableEvidence = true;
      } catch (error) {
        task.completionReadFailed = true;
        warnings.push(
          `Task ${task.id}: completion UNKNOWN; ${error instanceof PursuitReadError ? error.message : "status read failed"}`,
        );
        if (
          error instanceof PursuitReadError &&
          ["AUTH", "LIMIT", "TIMEOUT", "CONFIG"].includes(error.code)
        )
          blocked = true;
      }
    }
  }
  if (tasks.length > limits.maxTasks) throw new PursuitReadError("LIMIT");
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
  return { ...day, tasks, warnings, source: "live" };
}
