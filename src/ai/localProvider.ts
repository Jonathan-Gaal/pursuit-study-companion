import type { AIProvider, DeepDive } from "./provider.js";
import type { Task, Concept } from "../types/index.js";
import { extractConcepts } from "../learning/concepts.js";
import { material } from "./material.js";
export class LocalProvider implements AIProvider {
  readonly mode = "offline" as const;
  async extractConcepts(task: Task): Promise<Concept[]> {
    if (task.protectedKind) return [];
    return extractConcepts(task);
  }
  async generateDeepDive(concept: Concept): Promise<DeepDive> {
    const content = material[concept.id];
    if (!content) throw new Error("No reviewed offline material for concept");
    return content;
  }
}
