import type { CompletionStatus } from "../pursuit/completion.js";
import type { ProtectedKind } from "../pursuit/protection.js";
import type { TaskAssets } from "../learning/taskAssets.js";
export type TaskClass =
  "LEARNING" | "ROUTINE" | "DELIVERABLE" | "IGNORE" | "NEEDS_USER";
export interface Task {
  assets?: TaskAssets;
  taskIntent?: string | null;
  taskMode?: string | null;
  protectedKind: ProtectedKind | null;
  id: number;
  title: string;
  text: string;
  type: string;
  deliverableType: string | null;
  deliverableEvidence: boolean;
  uncertain: boolean;
  completed: boolean | null;
  completionReadFailed?: boolean;
  completionDetails?: CompletionStatus;
}
export interface Day {
  sourcePath?: string;
  cohort?: string;
  dayNumber?: number;
  dayId?: number;
  selection?: "automatic-known-days" | "automatic-preflight" | "historical";
  source?: "fixture" | "live";
  date: string;
  tasks: Task[];
  warnings: string[];
}
export interface Classification {
  classification: TaskClass;
  reason: string;
  extractLearning: boolean;
  requiresUser: boolean;
  futureResponseCandidate: boolean;
  externalArtifact: boolean;
}
export interface Concept {
  id: string;
  name: string;
  taskIds: number[];
}
export interface TaskState {
  protectedKind: ProtectedKind | null;
  taskId: number;
  establishedFacts: Record<string, string | string[]>;
  generatedContext: Record<string, string | string[]>;
  conversationTurns: number;
  classification: Classification;
  conceptIds: string[];
  completion: boolean | null;
  completionDetails?: CompletionStatus;
  completionSource?: "fixture" | "live";
  status: "NEEDS_USER" | "SKIPPED" | "READ_ONLY";
  submissionAttempts: never[];
}
export interface LocalState {
  version: 1;
  days: Record<
    string,
    { note: string; conceptIds: string[]; taskIds: number[] }
  >;
  tasks: Record<string, TaskState>;
}
