import { HistoryStore } from "../history/store.js";
import { constants } from "node:fs";
import { open, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { readBoundedJson } from "../pursuit/boundedFile.js";

export interface AssignmentProgressTask {
  taskId: number;
  title: string;
  status: string;
  reason?: string;
  sent?: number;
}

export interface AssignmentProgress {
  running: boolean;
  date?: string;
  dayId?: number;
  dayNumber?: number;
  updatedAt: string;
  tasks: AssignmentProgressTask[];
}

export function assignmentProgressPath(root: string): string {
  return resolve(root, ".runtime/assignment-run-progress.json");
}

export async function writeAssignmentProgress(
  root: string,
  progress: AssignmentProgress,
): Promise<void> {
  const path = assignmentProgressPath(root);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const file = await open(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(progress, null, 2)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  const history = new HistoryStore(root);
  try {
    history.recordProgress(progress);
  } finally {
    history.close();
  }
}

export async function readAssignmentProgress(
  root: string,
): Promise<AssignmentProgress | null> {
  const value = await readBoundedJson(assignmentProgressPath(root));
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AssignmentProgress>;
  if (
    typeof candidate.running !== "boolean" ||
    typeof candidate.updatedAt !== "string" ||
    !Array.isArray(candidate.tasks) ||
    candidate.tasks.some(
      (task) =>
        !task ||
        !Number.isSafeInteger(task.taskId) ||
        typeof task.title !== "string" ||
        typeof task.status !== "string" ||
        (task.reason !== undefined && typeof task.reason !== "string") ||
        (task.sent !== undefined && !Number.isSafeInteger(task.sent)),
    )
  )
    return null;
  return candidate as AssignmentProgress;
}
