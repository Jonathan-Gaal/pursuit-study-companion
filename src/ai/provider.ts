import type { Task, Concept } from "../types/index.js";
export interface DeepDive {
  coreIdea: string;
  deepDive: string;
  howItWorks: string;
  practicalExample: string;
  tradeOffs: string;
  failureModes: string;
  realWork: string;
  level: string;
  remember: string;
  questions: string;
}
export interface AIProvider {
  readonly mode: "offline" | "external";
  extractConcepts(task: Task, signal?: AbortSignal): Promise<Concept[]>;
  generateDeepDive(concept: Concept, signal?: AbortSignal): Promise<DeepDive>;
}
