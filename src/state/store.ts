import { readBoundedJson } from "../pursuit/boundedFile.js";
import { limits } from "../config/limits.js";
import { writeFile, rename, mkdir, lstat } from "node:fs/promises";
import type { LocalState, TaskState } from "../types/index.js";
import { insideRoot } from "../config/index.js";
export function emptyState(): LocalState {
  return { version: 1, tasks: {}, days: {} };
}
export async function ensureOutputDir(
  root: string,
  dir: string,
): Promise<void> {
  const path = insideRoot(root, dir);
  await mkdir(path, { recursive: true });
  if ((await lstat(path)).isSymbolicLink())
    throw new Error("Output directory cannot be a symlink");
}
export async function loadState(root: string): Promise<LocalState> {
  try {
    const parsed: unknown = await readBoundedJson(
      insideRoot(root, "state/tasks.json"),
    );
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid state");
    const state = parsed as LocalState;
    if (
      state.version !== 1 ||
      !state.tasks ||
      typeof state.tasks !== "object" ||
      Array.isArray(state.tasks) ||
      !state.days ||
      typeof state.days !== "object" ||
      Array.isArray(state.days)
    )
      throw new Error("Invalid state");
    for (const [key, task] of Object.entries(state.tasks)) {
      if (
        !task ||
        String(task.taskId) !== key ||
        !Number.isSafeInteger(task.taskId) ||
        !Number.isSafeInteger(task.conversationTurns) ||
        task.conversationTurns < 0 ||
        !task.establishedFacts ||
        typeof task.establishedFacts !== "object" ||
        Array.isArray(task.establishedFacts) ||
        !task.generatedContext ||
        typeof task.generatedContext !== "object" ||
        Array.isArray(task.generatedContext) ||
        !Array.isArray(task.conceptIds) ||
        !task.classification ||
        ![
          "LEARNING",
          "ROUTINE",
          "DELIVERABLE",
          "IGNORE",
          "NEEDS_USER",
        ].includes(task.classification.classification) ||
        !Array.isArray(task.submissionAttempts) ||
        task.submissionAttempts.length
      )
        throw new Error("Invalid state");
      for (const fact of [
        ...Object.values(task.establishedFacts),
        ...Object.values(task.generatedContext),
      ])
        if (
          typeof fact !== "string" &&
          !(
            Array.isArray(fact) &&
            fact.every((item) => typeof item === "string")
          )
        )
          throw new Error("Invalid state");
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw new Error(
      "Local state is invalid; preserve and review it before rerunning",
    );
  }
}
export async function saveState(
  root: string,
  state: LocalState,
): Promise<void> {
  await ensureOutputDir(root, "state");
  const path = insideRoot(root, "state/tasks.json");
  const temporary = insideRoot(root, "state/tasks.json.tmp");
  try {
    if ((await lstat(temporary)).isSymbolicLink())
      throw new Error("Unsafe temporary state file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const serialized = JSON.stringify(state, null, 2) + "\n";
  if (Buffer.byteLength(serialized) > limits.maxFileBytes)
    throw new Error("State exceeds size budget; archive older state manually");
  await writeFile(temporary, serialized, { mode: 0o600 });
  await rename(temporary, path);
}
export function maySubmit(): false {
  return false;
}
