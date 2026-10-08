import type { Concept, Task } from "../types/index.js";
import type { DeepDive } from "../ai/provider.js";
export function includeAssignmentNotes(task: Task): boolean {
  return (
    !/\b(?:daily\s+)?stand[ -]?up\b/i.test(task.title) &&
    !/^lunch$/i.test(task.title.trim()) &&
    task.type !== "lunch"
  );
}

export function assignmentNotes(task: Task, concepts: Concept[]): string {
  const title = task.title.replace(/[\r\n]/g, " ");
  if (task.protectedKind)
    return `### ${task.protectedKind === "ASSESSMENT" ? "Assessment" : "Weekly Survey"} — complete manually\n\nTask ${task.id}.\n`;
  const related = concepts.filter((concept) =>
    concept.taskIds.includes(task.id),
  );
  return `### ${title}\n\nTask ${task.id}\n\n#### Curriculum notes\n\n${task.text.trim() || "No curriculum text available. Review this assignment in Pursuit."}\n\n#### Further reading\n\n${related.length ? related.map((concept) => `- ${concept.name} — see the study section below.`).join("\n") : "No curated deep dive is available yet. The curriculum notes above are included for your review."}\n`;
}

export function sharedThreads(concepts: Concept[], tasks: Task[]): Concept[] {
  const included = new Set(
    tasks
      .filter((task) => includeAssignmentNotes(task) && !task.protectedKind)
      .map((task) => task.id),
  );
  return concepts
    .map((concept) => ({
      ...concept,
      taskIds: concept.taskIds.filter((id) => included.has(id)),
    }))
    .filter((concept) => concept.taskIds.length >= 2);
}

export function sharedThreadOverview(
  concepts: Concept[],
  tasks: Task[],
): string {
  const threads = sharedThreads(concepts, tasks);
  return (
    "## Common Threads\n\n" +
    (threads.length
      ? "These concepts recur in separate assignments. Their shared deep dives below connect the assignments; this is a curriculum pattern, not proof of instructor intent.\n\n" +
        threads
          .map(
            (concept) =>
              `- **${concept.name}** — ${concept.taskIds.length} assignments: ${concept.taskIds.map((id) => `Task ${id}`).join(", ")}.`,
          )
          .join("\n")
      : "No recurring supported concept was detected across separate assignments. Review the individual notes for additional connections.") +
    "\n"
  );
}

export function studySection(
  concept: Concept,
  content: DeepDive,
  tasks: Task[],
  source: "fixture" | "live" = "fixture",
  shared = false,
): string {
  const sources = tasks
    .filter((task) => concept.taskIds.includes(task.id))
    .map((task) => `- Task ${task.id}: ${task.title.replace(/[\r\n]/g, " ")}`)
    .join("\n");
  const sections: [string, string][] = [
    [
      "Why this appeared today",
      `${source === "live" ? "The following Pursuit tasks" : "The following fixture tasks"} introduced or reinforced this concept:\n\n${sources}`,
    ],
    ["Core Idea", content.coreIdea],
    ["Deep Dive", content.deepDive],
    ["How It Works", content.howItWorks],
    ["Practical Example", content.practicalExample],
    ["Trade-offs", content.tradeOffs],
    ["Common Failure Modes", content.failureModes],
    ["Connection to Real Development Work", content.realWork],
    ["What I Need to Know at My Level", content.level],
    ["What I Should Remember", content.remember],
    ["Questions I Should Be Able to Answer", content.questions],
    ["Pursuit Source", sources],
  ];
  return (
    `## ${concept.name}\n\n${shared ? "Shared-theme deep dive: this concept connects multiple assignments listed below. Read the explanation once, then use the source tasks to compare how the concept applies in each context.\n\n" : ""}` +
    sections.map(([title, body]) => `### ${title}\n\n${body}\n`).join("\n")
  );
}
