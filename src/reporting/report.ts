import type { Task, Classification, Concept } from "../types/index.js";
export interface ClassifiedTask {
  task: Task;
  result: Classification;
}
export function dailyReport(
  date: string,
  tasks: ClassifiedTask[],
  concepts: Concept[],
  errors: string[],
  source: "fixture" | "live" = "fixture",
): string {
  const lines = [
    `PURSUIT STUDY COMPANION — ${date}`,
    "",
    "STUDY MATERIAL",
    ...concepts.map((c) => `✓ ${c.name}`),
  ];
  if (source === "live") {
    lines.push("", "PURSUIT COMPLETION — reported by Pursuit");
    for (const { task } of tasks)
      lines.push(
        `• Task ${task.id} — ${task.protectedKind ? (task.protectedKind === "ASSESSMENT" ? "Assessment" : "Weekly Survey") : task.title}: ${task.completed === true ? "COMPLETE" : task.completed === false ? "INCOMPLETE" : "UNKNOWN"}`,
      );
    lines.push("", "READ-ONLY: completion status does not enable automation.");
  }
  for (const [category, label, symbol] of [
    ["LEARNING", "LEARNING TASKS", "✓"],
    ["ROUTINE", "ROUTINE", "•"],
    ["IGNORE", "IGNORED", "⏭"],
    ["DELIVERABLE", "NEEDS USER", "→"],
  ] as const) {
    lines.push(
      "",
      category === "DELIVERABLE" && source === "live"
        ? "USER-OWNED WORK / REVIEW"
        : label,
    );
    const matching = tasks.filter(
      (t) =>
        t.result.classification === category ||
        (category === "DELIVERABLE" &&
          t.result.classification === "NEEDS_USER"),
    );
    lines.push(
      ...(matching.length
        ? matching.map(({ task, result }) =>
            task.protectedKind
              ? `→ ${result.reason}`
              : `${symbol} Task ${task.id} — ${task.title}: ${result.reason}${source === "live" && category === "DELIVERABLE" && task.completed === true ? " (COMPLETE — no pending action requested)" : ""}`,
          )
        : ["None"]),
    );
  }
  lines.push(
    "",
    "SUBMISSIONS",
    "0 — dry-run/read-only",
    "",
    "ERRORS / WARNINGS",
    ...(errors.length ? errors : ["None"]),
  );
  return lines.join("\n");
}
