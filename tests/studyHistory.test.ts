import { it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStudyNote,
  existingStudyNote,
} from "../src/learning/noteStore.js";
import { linkStudySources } from "../src/learning/sourceLinks.js";
import { HistoryStore } from "../src/history/store.js";
import {
  loadSavedLiveDay,
  refreshHistoricalDay,
} from "../src/history/refresh.js";
import { emptyState } from "../src/state/store.js";
import { parseDay } from "../src/pursuit/parser.js";
import { classify } from "../src/classification/index.js";

it("publishes one note across competing runs and refuses unsafe existing notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-reuse-"));
  try {
    const results = await Promise.all([
      createStudyNote(root, "2026-10-06", "First"),
      createStudyNote(root, "2026-10-06", "Second"),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const note = (await existingStudyNote(root, "2026-10-06"))!;
    expect(["First", "Second"]).toContain(await readFile(note, "utf8"));
    await writeFile(join(root, "study-notes/2026-10-05.md"), "");
    await expect(
      createStudyNote(root, "2026-10-05", "Replacement"),
    ).rejects.toThrow("needs review");
    await symlink(note, join(root, "study-notes/2026-10-04.md"));
    await expect(
      createStudyNote(root, "2026-10-04", "Replacement"),
    ).rejects.toThrow("needs review");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("links legacy source references without linking protected tasks or duplicating links", () => {
  const markdown =
    "### Pursuit Source\n\n- Task 10: API boundaries\n- Task 20: Assessment\n";
  const linked = linkStudySources(markdown, "2026-10-06", [10]);
  expect(linked).toContain("[Task 10](/?date=2026-10-06&lesson=10)");
  expect(linked).toContain("- Task 20: Assessment");
  expect(linkStudySources(linked, "2026-10-06", [10])).toBe(linked);
});

it("links only source sections and leaves examples and unknown references unchanged", () => {
  const markdown =
    "Task 10: Example\n### Pursuit Source\n- Task 10: Saved lesson\n- Task 99: Unknown\n```text\nTask 10: Code example\n```\n## Practical Example\nTask 10: Another example";
  const linked = linkStudySources(markdown, "2026-10-05", [10]);
  expect(linked.match(/\[Task 10\]/g)).toHaveLength(1);
  expect(linked).toContain("/?date=2026-10-05&lesson=10");
  expect(linked).toContain("Task 10: Code example");
  expect(linked).toContain("Task 10: Another example");
  expect(linked).toContain("Task 99: Unknown");
});

it("retains past lesson sources, concepts and completion and refreshes only the exact saved day", async () => {
  const root = await mkdtemp(join(tmpdir(), "lesson-history-"));
  let history = new HistoryStore(root);
  try {
    const day = parseDay({
      date: "2026-10-05",
      flattenedTasks: [
        {
          id: 10,
          title: "API boundaries",
          type: "learning",
          v2_lesson_content: "Useful API curriculum",
          isComplete: false,
        },
        {
          id: 20,
          title: "Assessment",
          type: "assessment",
          v2_lesson_content: "SECRET PROTECTED CONTENT",
          isComplete: false,
        },
      ],
    });
    day.dayId = 123;
    day.source = "live";
    day.cohort = "test";
    day.sourcePath = "/api/curriculum/days/123/full-details?cohort=test";
    const state = emptyState();
    state.days[day.date] = {
      note: `study-notes/${day.date}.md`,
      conceptIds: ["api"],
      taskIds: [10, 20],
    };
    for (const task of day.tasks)
      state.tasks[String(task.id)] = {
        taskId: task.id,
        protectedKind: task.protectedKind,
        classification: classify(task),
        establishedFacts: {},
        generatedContext: {},
        conversationTurns: 0,
        conceptIds: task.protectedKind ? [] : ["api"],
        completion: task.completed,
        status: "READ_ONLY",
        submissionAttempts: [],
      };
    history.recordDay(day, state);
    await createStudyNote(root, day.date, "Original notes");
    history.close();
    history = new HistoryStore(root);
    const saved = history.day(day.date)!;
    expect(saved.tasks[0]?.content).toContain("Useful API curriculum");
    expect(saved.tasks[0]?.concept_ids).toBe('["api"]');
    expect(saved.tasks[1]?.content).toBeNull();
    expect(JSON.stringify(saved)).not.toContain("SECRET PROTECTED CONTENT");
    const makeReader = vi.fn(() => ({
      loadDay: async () => ({
        ...day,
        tasks: day.tasks.map((task) => ({ ...task, completed: true })),
      }),
    }));
    await refreshHistoricalDay(root, history, day.date, makeReader);
    expect(makeReader).toHaveBeenCalledWith({ dayId: 123, cohort: "test" });
    expect(history.day(day.date)?.tasks[0]?.completion).toBe(1);
    expect(history.day(day.date)?.tasks[0]?.concept_ids).toBe('["api"]');
    expect(
      await readFile(join(root, `study-notes/${day.date}.md`), "utf8"),
    ).toBe("Original notes");
    await expect(
      refreshHistoricalDay(root, history, day.date, () => ({
        loadDay: async () => ({ ...day, date: "2026-10-04" }),
      })),
    ).rejects.toThrow("does not match");
    await expect(
      loadSavedLiveDay(root, history, day.date, () => ({
        loadDay: async () => ({ ...day, dayId: 999 }),
      })),
    ).rejects.toThrow("does not match");
    await expect(
      loadSavedLiveDay(root, history, day.date, () => ({
        loadDay: async () => ({ ...day, source: "fixture" as const }),
      })),
    ).rejects.toThrow("does not match");
    await expect(
      refreshHistoricalDay(root, history, "2026-10-03", makeReader),
    ).rejects.toThrow("no saved");
  } finally {
    history.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("prepares notes from the assignment day's curriculum and reuses them on subsequent task runs", async () => {
  const { ensureDailyNotes } =
    await import("../src/learning/ensureDailyNotes.js");
  const root = await mkdtemp(join(tmpdir(), "assignment-notes-"));
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Offline only"));
  try {
    const day = parseDay({
      date: "2026-10-06",
      flattenedTasks: [
        {
          id: 10,
          title: "REST API lesson",
          type: "learning",
          v2_lesson_content: "REST API boundaries",
          isComplete: false,
        },
      ],
    });
    day.source = "live";
    day.dayId = 123;
    const first = await ensureDailyNotes(root, day);
    expect(first.noteStatus).toBe("CREATED");
    const content = await readFile(first.note, "utf8");
    const second = await ensureDailyNotes(root, day);
    expect(second.noteStatus).toBe("REUSED");
    expect(await readFile(first.note, "utf8")).toBe(content);
    await expect(
      readFile(join(root, ".runtime/study-run.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const history = new HistoryStore(root);
    try {
      expect(
        history.day(day.date)?.runs.filter((run) => run.kind === "study"),
      ).toHaveLength(2);
    } finally {
      history.close();
    }
    expect(network).not.toHaveBeenCalled();
    await writeFile(join(root, ".runtime/study-run.lock"), "busy");
    await expect(ensureDailyNotes(root, day)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(join(root, ".runtime/study-run.lock"), "utf8")).toBe(
      "busy",
    );
  } finally {
    network.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
