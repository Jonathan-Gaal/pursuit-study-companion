import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HistoryStore } from "../src/history/store.js";
import { parseDay } from "../src/pursuit/parser.js";
import { emptyState } from "../src/state/store.js";
import { classify } from "../src/classification/index.js";
import { buildLibrary, weekRange } from "../src/learning/library.js";
import { dashboardApi } from "../src/dashboard/api.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "learning-library-"));
  roots.push(root);
  const history = new HistoryStore(root);
  for (const date of ["2026-10-05", "2026-10-06", "2026-09-28"]) {
    const day = parseDay({
      date,
      flattenedTasks: [
        {
          id: 10,
          title: "Learn APIs and deployment",
          type: "learning",
          description: "API validation and deployment",
          completed: date === "2026-10-05",
        },
        {
          id: 20,
          title: "Assessment",
          type: "assessment",
          description: "SECRET ASSESSMENT",
          isComplete: false,
        },
        {
          id: 30,
          title: "Weekly Survey",
          type: "routine",
          description: "SECRET SURVEY",
          isComplete: false,
        },
      ],
    });
    day.source = "live";
    day.dayId = 1645;
    day.cohort = "test";
    const state = emptyState();
    state.days[date] = {
      note: `study-notes/${date}.md`,
      conceptIds: ["api-validation", "deployment"],
      taskIds: [10, 20, 30],
    };
    for (const task of day.tasks)
      state.tasks[String(task.id)] = {
        taskId: task.id,
        protectedKind: task.protectedKind,
        classification: classify(task),
        establishedFacts: {},
        generatedContext: {},
        conversationTurns: 0,
        conceptIds: task.protectedKind ? [] : ["api-validation", "deployment"],
        completion: task.completed,
        status: "READ_ONLY",
        submissionAttempts: [],
      };
    history.recordDay(day, state);
  }
  await mkdir(join(root, "study-notes"));
  const note =
    "# Daily Learning\n## Assignment Notes\n### Learn APIs and deployment\nTask 10\n#### Curriculum notes\nValidate input before deploying.\n### Assessment — complete manually\nTask 20\n### Questions I Should Be Able to Answer\n- SECRET ASSESSMENT?\n### Weekly Survey — complete manually\nTask 30\n### Questions I Should Be Able to Answer\n- SECRET SURVEY?\n## API Validation\n### Core Idea\nValidate input at the API boundary.\n### What I Should Remember\n- Treat all client input as untrusted.\n### Questions I Should Be Able to Answer\n- Why validate input on the server?\n- Why validate input on the server?\n### Pursuit Source\n- Task 10: Learn APIs and deployment\n";
  await writeFile(join(root, "study-notes/2026-10-06.md"), note);
  return { root, history, note };
}

it("builds an offline searchable library, deduplicated concept map and exact weekly recap without protected content", async () => {
  const { root, history } = await setup();
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network"));
  try {
    history.saveAnnotation("2026-10-06", "My idempotency example", 0);
    const library = await buildLibrary(
      root,
      history,
      "2026-10-06",
      "idempotency",
    );
    expect(library.search).toEqual([
      expect.objectContaining({ kind: "annotation", date: "2026-10-06" }),
    ]);
    expect(library.concepts.map((node) => node.id)).toEqual([
      "api-validation",
      "deployment",
    ]);
    expect(library.concepts[0]?.lessons).toHaveLength(3);
    expect(library.edges).toEqual([
      { from: "api-validation", to: "deployment", count: 3 },
    ]);
    expect(library.cards).toHaveLength(1);
    expect(library.cards[0]?.answer).toContain("API boundary");
    expect(library.weekly).toMatchObject({
      start: "2026-10-05",
      end: "2026-10-11",
      days: 2,
      notes: 1,
      completed: 1,
      incomplete: 1,
      manual: 4,
    });
    expect(JSON.stringify(library)).not.toContain("SECRET");
    expect(
      (await buildLibrary(root, history, "2026-10-06", "deployment")).search
        .length,
    ).toBeGreaterThan(0);
    expect(network).not.toHaveBeenCalled();
  } finally {
    history.close();
  }
});

it("persists annotations independently, rejects stale edits and upgrades the existing database without losing data", async () => {
  const { root, history, note } = await setup();
  history.saveAnnotation("2026-10-06", "My original example", 0);
  expect(() => history.saveAnnotation("2026-10-06", "Stale edit", 0)).toThrow(
    "changed",
  );
  expect(() =>
    history.saveAnnotation("2026-10-06", "x".repeat(32001), 1),
  ).toThrow();
  history.close();
  const legacy = new DatabaseSync(join(root, "state/pursuit.db"));
  legacy.exec("PRAGMA user_version=1");
  legacy.close();
  const reopened = new HistoryStore(root);
  try {
    expect(reopened.annotation("2026-10-06")).toMatchObject({
      text: "My original example",
      revision: 1,
    });
    expect(reopened.day("2026-10-06")?.tasks).toHaveLength(3);
    expect(
      await readFile(join(root, "study-notes/2026-10-06.md"), "utf8"),
    ).toBe(note);
  } finally {
    reopened.close();
  }
});

it("schedules rated cards durably and brings difficult concepts back when due", async () => {
  const { root, history } = await setup();
  const now = new Date("2026-10-06T12:00:00Z");
  try {
    const library = await buildLibrary(root, history, "2026-10-06", "", now);
    const card = library.cards[0]!;
    expect(library.dueCount).toBe(1);
    history.recordReview(card.id, card.date, "again", now);
    expect(
      (await buildLibrary(root, history, card.date, "", now)).dueCount,
    ).toBe(0);
    expect(
      (
        await buildLibrary(
          root,
          history,
          card.date,
          "",
          new Date("2026-10-07T12:00:00Z"),
        )
      ).dueCount,
    ).toBe(1);
    expect(
      (await buildLibrary(root, history, card.date)).weekly.revisit,
    ).toContainEqual({
      concept: "API Validation",
      date: card.date,
      rating: "again",
    });
    history.recordReview(card.id, card.date, "easy", now);
    expect(history.reviews()[0]?.interval_days).toBe(7);
    expect(() => history.recordReview("bad", card.date, "good")).toThrow();
  } finally {
    history.close();
  }
});

it("fails closed on unsafe saved notes and observes calendar weeks across years", async () => {
  const { root, history } = await setup();
  try {
    await symlink(
      join(root, "study-notes/2026-10-06.md"),
      join(root, "study-notes/2026-10-05.md"),
    );
    const library = await buildLibrary(root, history, "2026-10-06");
    expect(library.warnings).toContain(
      "Saved notes for 2026-10-05 need review and were skipped.",
    );
    expect(weekRange("2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
    expect(() => weekRange("2026-02-30")).toThrow();
  } finally {
    history.close();
  }
});

it("permits only validated local annotation/review writes and does not start assignment workers", async () => {
  const { root, history } = await setup();
  const start = vi.fn(async () => true);
  const deps = {
    root,
    history,
    port: 4781,
    active: async () => null,
    progress: async () => null,
    start,
  };
  const headers = {
    host: "127.0.0.1:4781",
    "content-type": "application/json",
  };
  try {
    const save = { method: "POST", url: "/api/annotations", headers };
    expect(
      (
        await dashboardApi(save, {
          ...deps,
          readJson: async () => ({
            date: "2026-10-06",
            text: "Saved example",
            revision: 0,
          }),
        })
      )?.status,
    ).toBe(200);
    expect(
      (
        await dashboardApi(save, {
          ...deps,
          readJson: async () => ({
            date: "2026-10-06",
            text: "Lost update",
            revision: 0,
          }),
        })
      )?.status,
    ).toBe(409);
    expect(
      (
        await dashboardApi(
          { ...save, headers: { ...headers, origin: "https://evil.example" } },
          deps,
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await dashboardApi(
          {
            method: "GET",
            url: "/api/library?q=SECRET&week=2026-10-06",
            headers,
          },
          deps,
        )
      )?.body,
    ).toMatchObject({ search: [] });
    expect(
      (
        await dashboardApi(
          { method: "POST", url: "/api/review", headers },
          {
            ...deps,
            readJson: async () => ({
              date: "2026-10-06",
              cardId: "a".repeat(64),
              rating: "good",
            }),
          },
        )
      )?.status,
    ).toBe(409);
    const card = (await buildLibrary(root, history, "2026-10-06")).cards[0]!;
    expect(
      (
        await dashboardApi(
          { method: "POST", url: "/api/review", headers },
          {
            ...deps,
            readJson: async () => ({
              date: card.date,
              cardId: card.id,
              rating: "hard",
            }),
          },
        )
      )?.status,
    ).toBe(200);
    expect(start).not.toHaveBeenCalled();
  } finally {
    history.close();
  }
});
