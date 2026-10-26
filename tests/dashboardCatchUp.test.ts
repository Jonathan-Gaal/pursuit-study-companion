import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DashboardCatchUp } from "../src/dashboard/catchUp.js";
import { HistoryStore } from "../src/history/store.js";
import { emptyState } from "../src/state/store.js";
import { LivePursuitClient } from "../src/pursuit/liveClient.js";
import { parseCompletion } from "../src/pursuit/completion.js";
import { parseDay } from "../src/pursuit/parser.js";
import { fullDetailsPath } from "../src/config/daySelection.js";
import {
  PursuitReadError,
  CurriculumUnavailableError,
} from "../src/pursuit/errors.js";

vi.mock("../src/config/environment.js", () => ({
  loadLocalEnvironment: vi.fn(),
}));

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
it("imports protected/manual and ordinary day entries, preserves files, and deduplicates simultaneous launch checks", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "pursuit-catch-up-"));
  roots.push(root);
  await mkdir(resolve(root, ".runtime"));
  await mkdir(resolve(root, "submissions"));
  await writeFile(resolve(root, "submissions/keep.json"), "existing journal");
  const history = new HistoryStore(root);
  const cohort = "L2 - September 2026";
  const day = (dayId: number, date: string) => ({
    ...parseDay({
      date,
      flattenedTasks: [
        { id: dayId * 10, title: "API lesson", type: "learning" },
        {
          id: dayId * 10 + 1,
          title: "Assessment",
          type: "assessment",
          description: "private protected content",
        },
        {
          id: dayId * 10 + 2,
          title: "Weekly Survey",
          type: "survey",
          description: "private survey content",
        },
      ],
    }),
    dayId,
    cohort,
    source: "live" as const,
    sourcePath: fullDetailsPath({ dayId, cohort }),
  });
  history.recordDay(day(10, "2026-10-12"), emptyState());
  history.recordDay(day(12, "2026-10-14"), emptyState());
  const load = vi
    .spyOn(LivePursuitClient.prototype, "loadDefinitions")
    .mockImplementation(async (selection) => {
      if (selection.dayId === 11) return day(11, "2026-10-13");
      if (selection.dayId === 10) return day(10, "2026-10-12");
      if (selection.dayId === 12) return day(12, "2026-10-14");
      throw new CurriculumUnavailableError(403);
    });
  vi.spyOn(LivePursuitClient.prototype, "getCompletion").mockResolvedValue(
    parseCompletion({ isComplete: false }),
  );
  const service = new DashboardCatchUp(root, history, async () => false);
  try {
    await Promise.all([service.request(), service.request()]);
    expect(service.status.imported).toBe(1);
    expect(service.status.refreshed).toBe(2);
    expect(history.runs()[0]?.status).toBe("PARTIAL");
    expect(service.status.message).toContain("Fetched 1 missing days");
    expect(history.day("2026-10-13")?.day_id).toBe(11);
    expect(
      history
        .day("2026-10-13")
        ?.tasks.filter((t) => t.protected_kind)
        .every((t) => t.content === null),
    ).toBe(true);
    expect(await readFile(resolve(root, "submissions/keep.json"), "utf8")).toBe(
      "existing journal",
    );
    expect(load.mock.calls.filter(([s]) => s.dayId === 11)).toHaveLength(1);
    const calls = load.mock.calls.length;
    await service.request();
    expect(load).toHaveBeenCalledTimes(calls);
    await service.request(true);
    expect(load.mock.calls.length).toBeGreaterThan(calls);
    expect(service.status.refreshed).toBe(3);
    load.mockRejectedValue(new PursuitReadError("AUTH"));
    await service.request(true);
    expect(service.status.message).toContain("update PURSUIT_TOKEN");
    expect(service.status.running).toBe(false);
  } finally {
    history.close();
  }
});
it("defers while a run is active without making live calls", async () => {
  const load = vi.spyOn(LivePursuitClient.prototype, "loadDefinitions");
  const service = new DashboardCatchUp(
    "/unused",
    {} as HistoryStore,
    async () => true,
  );
  await service.request();
  expect(load).not.toHaveBeenCalled();
  expect(service.status.running).toBe(false);
});

it("pauses background sync at a read boundary and releases its lock before a study import", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "pursuit-sync-pause-"));
  roots.push(root);
  await mkdir(resolve(root, ".runtime"));
  const history = new HistoryStore(root);
  const cohort = "L2 - September 2026";
  const saved = {
    ...parseDay({
      date: "2026-10-08",
      flattenedTasks: [{ id: 10, title: "API lesson", type: "learning" }],
    }),
    dayId: 10,
    cohort,
    source: "live" as const,
    sourcePath: fullDetailsPath({ dayId: 10, cohort }),
  };
  history.recordDay(saved, emptyState());
  let release!: () => void;
  let reached!: () => void;
  const waiting = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const load = vi
    .spyOn(LivePursuitClient.prototype, "loadDefinitions")
    .mockImplementation(async (selection) => {
      reached();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ...saved, dayId: selection.dayId, date: "2026-10-19" };
    });
  const service = new DashboardCatchUp(root, history, async () => false);
  try {
    const work = service.request();
    await waiting;
    const paused = service.pause();
    release();
    await Promise.all([work, paused]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(service.status.running).toBe(false);
    expect(service.status.message).toContain("paused for your study import");
    expect(history.runs()[0]?.status).toBe("PAUSED");
    const { lstat } = await import("node:fs/promises");
    await expect(
      lstat(resolve(root, ".runtime/study-run.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(history.day("2026-10-08")?.day_id).toBe(10);
  } finally {
    history.close();
  }
});
