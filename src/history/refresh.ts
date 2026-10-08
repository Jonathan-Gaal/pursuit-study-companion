import type { HistoryStore } from "./store.js";
import { LivePursuitClient } from "../pursuit/liveClient.js";
import { allowedReadPath, PURSUIT_ORIGIN } from "../pursuit/http.js";
import { loadState } from "../state/store.js";
import { fullDetailsPath, daySelection } from "../config/daySelection.js";
import { classify } from "../classification/index.js";
import type { PursuitReader } from "../pursuit/client.js";

/** Refresh a saved date using its verified identity, never a guessed day or URL. */
export async function loadSavedLiveDay(
  root: string,
  history: HistoryStore,
  date: string,
  makeReader: (selection: {
    dayId: number;
    cohort: string;
  }) => PursuitReader = (selection) =>
    new LivePursuitClient(undefined, selection),
) {
  const saved = history.day(date);
  const reference = saved?.tasks.find(
    (task) =>
      typeof task.source_path === "string" && typeof task.cohort === "string",
  );
  if (!saved || saved.source !== "live" || !saved.day_id)
    throw new Error(
      "This day has no saved verified live source. Import it with the daily --day command first.",
    );
  const cohort = reference
    ? String(reference.cohort)
    : daySelection({ ...process.env, PURSUIT_DAY_ID: String(saved.day_id) })
        .cohort;
  const path = reference
    ? String(reference.source_path)
    : fullDetailsPath({ dayId: saved.day_id, cohort });
  if (!allowedReadPath(path)) throw new Error("Saved day source is invalid.");
  const url = new URL(path, PURSUIT_ORIGIN);
  if (
    url.pathname !== `/api/curriculum/days/${saved.day_id}/full-details` ||
    url.searchParams.get("cohort") !== cohort
  )
    throw new Error("Saved day source does not match its identity.");
  const day = await makeReader({
    dayId: saved.day_id,
    cohort,
  }).loadDay();
  if (day.date !== date || day.dayId !== saved.day_id || day.source !== "live")
    throw new Error("Fetched day does not match the saved date.");
  return day;
}

export async function refreshHistoricalDay(
  root: string,
  history: HistoryStore,
  date: string,
  makeReader?: (selection: { dayId: number; cohort: string }) => PursuitReader,
) {
  const day = await loadSavedLiveDay(root, history, date, makeReader);
  const saved = history.day(date)!;
  const state = await loadState(root);
  // Only refresh the history index; notes and automation journals stay intact.
  for (const task of day.tasks) {
    const prior = state.tasks[String(task.id)];
    const stored = saved.tasks.find((entry) => entry.task_id === task.id);
    state.tasks[String(task.id)] = {
      taskId: task.id,
      protectedKind: task.protectedKind,
      establishedFacts: prior?.establishedFacts ?? {},
      generatedContext: prior?.generatedContext ?? {},
      conversationTurns: prior?.conversationTurns ?? 0,
      classification: classify(task),
      conceptIds: task.protectedKind
        ? []
        : stored?.concept_ids
          ? JSON.parse(String(stored.concept_ids))
          : (prior?.conceptIds ?? []),
      completion: task.completed,
      status: task.protectedKind ? "NEEDS_USER" : "READ_ONLY",
      submissionAttempts: [],
    };
  }
  state.days[date] = {
    note: saved.note ?? `study-notes/${date}.md`,
    conceptIds: state.days[date]?.conceptIds ?? [],
    taskIds: day.tasks.map((task) => task.id),
  };
  history.recordDay(day, state);
  return day;
}
