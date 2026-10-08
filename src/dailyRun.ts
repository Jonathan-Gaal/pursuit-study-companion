import { LivePursuitClient } from "./pursuit/liveClient.js";
import { validDate } from "./pursuit/parser.js";
import { limits } from "./config/limits.js";
import { RunBudget } from "./ai/budget.js";
import { linkStudySources } from "./learning/sourceLinks.js";
import { existingStudyNote, createStudyNote } from "./learning/noteStore.js";
import type { RunConfig } from "./config/index.js";
import { insideRoot } from "./config/index.js";
import { FixturePursuitClient, type PursuitReader } from "./pursuit/client.js";
import { classify } from "./classification/index.js";
import { consolidate } from "./learning/concepts.js";
import {
  studySection,
  assignmentNotes,
  includeAssignmentNotes,
  sharedThreads,
  sharedThreadOverview,
} from "./learning/markdown.js";
import { LocalProvider } from "./ai/localProvider.js";
import type { AIProvider } from "./ai/provider.js";
import { loadState, saveState } from "./state/store.js";
import { dailyReport } from "./reporting/report.js";
import { redact, redactJson } from "./reporting/security.js";
import { HistoryStore } from "./history/store.js";
import type { Concept } from "./types/index.js";
export async function dailyRun(
  config: RunConfig,
  reader: PursuitReader = config.mode === "live"
    ? new LivePursuitClient(undefined, undefined, {
        overrideDayId: config.dayId,
      })
    : new FixturePursuitClient(config.fixturePath),
  provider: AIProvider = new LocalProvider(),
) {
  if (config.dryRun !== true)
    throw new Error("V1 requires dry-run/read-only mode");
  if (provider.mode !== "offline")
    throw new Error(
      "External AI providers disabled: paid call and token budgets are zero",
    );
  const budget = new RunBudget();
  const day = await reader.loadDay();
  budget.check();
  if (!validDate(day.date) || day.tasks.length > limits.maxTasks)
    throw new Error("Daily data exceeds safety boundaries");
  const state = await loadState(config.root);
  const tasks = day.tasks.map((task) => ({ task, result: classify(task) }));
  const errors = [...day.warnings];
  const savedNote = await existingStudyNote(config.root, day.date);
  const extracted: Concept[] = [];
  if (!savedNote) {
    for (const { task, result } of tasks) {
      if (!result.extractLearning || !includeAssignmentNotes(task)) continue;
      try {
        extracted.push(
          ...(await budget.call((signal) =>
            provider.extractConcepts(task, signal),
          )),
        );
      } catch {
        errors.push(`Concept extraction failed for task ${task.id}`);
      }
    }
  }
  const concepts = consolidate(extracted);
  if (concepts.length > limits.maxConcepts)
    throw new Error("Concept count exceeds safety limit");
  const generated: Concept[] = [];
  const sections: string[] = [];
  const recurring = new Set(
    sharedThreads(concepts, day.tasks).map((concept) => concept.id),
  );
  for (const concept of concepts) {
    try {
      sections.push(
        studySection(
          concept,
          await budget.call((signal) =>
            provider.generateDeepDive(concept, signal),
          ),
          day.tasks,
          day.source ?? "fixture",
          recurring.has(concept.id),
        ),
      );
      generated.push(concept);
    } catch {
      errors.push(`Study material unavailable for concept ${concept.id}`);
    }
  }
  budget.check();
  const assignments = day.tasks.filter(includeAssignmentNotes);
  const assignmentSections = assignments
    .map((task) => assignmentNotes(task, generated))
    .join("\n");
  const noteRelative = `study-notes/${day.date}.md`;
  const secret = process.env.PURSUIT_TOKEN;
  const sanitize = (text: string) => redact(text, secret ? [secret] : []);
  const note = insideRoot(config.root, noteRelative);
  const created =
    !savedNote &&
    (await createStudyNote(
      config.root,
      day.date,
      sanitize(
        linkStudySources(
          `# Daily Learning — ${day.date}\n\n${day.source === "live" ? "Source: live Pursuit GET data (completion is what Pursuit reports, not independently verified work)." : "Source: sanitized synthetic Pursuit fixture."} Assignment notes preserve curriculum text for your review. Deep dives use offline curated templates. Examples are illustrative, not claims about work the user completed.\n\n${day.sourcePath ? `Curriculum GET: ${day.sourcePath}\nDay ID: ${day.dayId}\n\n` : ""}## Assignment Notes\n\n${assignmentSections}\n\n${sharedThreadOverview(generated, day.tasks)}\n${sections.join("\n") || "No curated deep dives available. Use the assignment notes above to choose what to explore.\n"}`,
          day.date,
          day.tasks
            .filter((task) => !task.protectedKind)
            .map((task) => task.id),
        ),
      ),
    ));
  for (const { task, result } of tasks) {
    const previous = state.tasks[String(task.id)];
    state.tasks[String(task.id)] = {
      taskId: task.id,
      protectedKind: task.protectedKind,
      establishedFacts: previous?.establishedFacts ?? {},
      generatedContext: previous?.generatedContext ?? {},
      conversationTurns: previous?.conversationTurns ?? 0,
      classification: result,
      conceptIds: created
        ? concepts.filter((c) => c.taskIds.includes(task.id)).map((c) => c.id)
        : result.extractLearning
          ? (previous?.conceptIds ?? [])
          : [],
      completion: task.completed,
      ...(task.completionDetails
        ? { completionDetails: task.completionDetails }
        : {}),
      completionSource: day.source ?? "fixture",
      status:
        task.protectedKind || (result.requiresUser && task.completed !== true)
          ? "NEEDS_USER"
          : result.classification === "IGNORE"
            ? "SKIPPED"
            : "READ_ONLY",
      submissionAttempts: [],
    };
  }
  state.days[day.date] = {
    note: noteRelative,
    conceptIds: created
      ? generated.map((c) => c.id)
      : (state.days[day.date]?.conceptIds ?? []),
    taskIds: day.tasks.map((t) => t.id),
  };
  await saveState(config.root, redactJson(state, secret ? [secret] : []));
  const history = new HistoryStore(config.root);
  try {
    history.recordDay(day, state);
  } finally {
    history.close();
  }
  return {
    date: day.date,
    noteStatus: created ? "CREATED" : "REUSED",
    report:
      (created
        ? "Study notes created.\n\n"
        : `Study notes already exist for ${day.date}; reused saved notes without regenerating.\n\n`) +
      `Assignment notes: ${assignments.length} (stand-ups and lunch excluded; protected tasks receive manual-only notices)\n\n` +
      `Common threads: ${
        sharedThreads(generated, day.tasks)
          .map(
            (concept) =>
              `${concept.name} (${concept.taskIds.length} assignments)`,
          )
          .join(", ") || "none detected"
      }\n\n` +
      (day.source === "live"
        ? `Selected date: ${day.date}\nSelected day ID: ${day.dayId ?? "unknown"}\nTask count: ${day.tasks.length}\nSelection: ${day.selection === "historical" ? "explicit historical override" : "exact-date match from configured verified day IDs"}\n\n`
        : "") +
      sanitize(
        dailyReport(
          day.date,
          tasks,
          generated,
          errors,
          day.source ?? "fixture",
        ),
      ),
    note,
    concepts: generated,
    tasks,
    errors,
  };
}
