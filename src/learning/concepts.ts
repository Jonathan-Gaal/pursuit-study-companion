import type { Task, Concept } from "../types/index.js";
export const conceptRules = [
  {
    id: "agent-fundamentals",
    name: "What Is an Agent?",
    pattern:
      /what is an agent|observe[\s–—-]+decide[\s–—-]+act|design-build-ai-agent|bot\/prompt\/skill\/agent/i,
  },
  {
    id: "company-research",
    name: "Company Research",
    pattern:
      /research a company|company research|researching a company|funding history|business model/i,
  },
  {
    id: "pair-working-agreements",
    name: "Pair Working Agreements",
    pattern:
      /work style|working agreement|communication plan|handling disagreement|collaborate-pair-team/i,
  },
  {
    id: "feedback-and-reflection",
    name: "Feedback and Reflection",
    pattern:
      /feedback report|reflect-on-growth|retrospective|retro reflection/i,
  },
  {
    id: "team-presentation-architecture",
    name: "Team Presentation Architecture",
    pattern:
      /presentation|storyboard|handoffs?|shared client narrative|presentation flow|transitions|presentation timing/i,
  },
  {
    id: "deployment",
    name: "Deployment",
    pattern: /deploy|production environment|release pipeline/i,
  },
  {
    id: "api-validation",
    name: "API Validation",
    pattern:
      /schema validation|api validation|input validation|inconsistent api responses/i,
  },
  {
    id: "product-prioritization",
    name: "Product Prioritization",
    pattern: /\brice\b|moscow|prioritization|prioritisation/i,
  },
  {
    id: "product-requirements",
    name: "Product Requirements and Scoping",
    pattern:
      /\bprd\b|write-prd|product requirements|scope-mvp|current user journey/i,
  },
  {
    id: "ux-research",
    name: "UX Research",
    pattern: /user research|usability|ux research|user interview/i,
  },
  {
    id: "database-design",
    name: "Database Design",
    pattern: /normalization|database design|foreign key|relational schema/i,
  },
];
export function extractConcepts(task: Task): Concept[] {
  if (task.protectedKind) return [];
  return conceptRules
    .filter((rule) => rule.pattern.test(task.text))
    .map(({ id, name }) => ({ id, name, taskIds: [task.id] }));
}
export function normalizeConcept(name: string): string {
  const rule = conceptRules.find(
    (rule) =>
      rule.id === name ||
      rule.name.toLowerCase() === name.toLowerCase() ||
      rule.pattern.test(name),
  );
  return (
    rule?.id ??
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}
export function consolidate(concepts: Concept[]): Concept[] {
  const merged = new Map<string, Concept>();
  for (const concept of concepts) {
    const id = normalizeConcept(concept.name);
    const previous = merged.get(id);
    const canonical =
      conceptRules.find((rule) => rule.id === id)?.name ?? concept.name;
    merged.set(id, {
      id,
      name: canonical,
      taskIds: [
        ...new Set([...(previous?.taskIds ?? []), ...concept.taskIds]),
      ].sort((a, b) => a - b),
    });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
