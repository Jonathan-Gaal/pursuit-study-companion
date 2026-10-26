import { expect, it, vi } from "vitest";
import { catchUpDays } from "../src/history/catchUp.js";
import {
  CurriculumUnavailableError,
  PursuitReadError,
} from "../src/pursuit/errors.js";
import type { Day } from "../src/types/index.js";

const cohort = "L2 - September 2026";
const anchors = [
  { date: "2026-10-12", dayId: 10, cohort },
  { date: "2026-10-15", dayId: 13, cohort },
];
function lesson(dayId: number, date: string): Day {
  return { dayId, date, cohort, source: "live", tasks: [], warnings: [] };
}
it("fills interior missing days even with today saved, without refetching saved IDs or creating weekends", async () => {
  const load = vi.fn(async ({ dayId }) => {
    if (dayId === 11) return lesson(11, "2026-10-13");
    if (dayId === 12) return lesson(12, "2026-10-14");
    throw new CurriculumUnavailableError(404);
  });
  const save = vi.fn();
  const result = await catchUpDays({
    today: "2026-10-15",
    anchors,
    load,
    save,
    progress: vi.fn(),
  });
  expect(save.mock.calls.map(([day]) => day.date)).toEqual([
    "2026-10-13",
    "2026-10-14",
  ]);
  expect(load.mock.calls.some(([s]) => [10, 13].includes(s.dayId))).toBe(false);
  expect(result.imported).toBe(2);
});
it("discovers later days after missed launches and excludes future curriculum", async () => {
  const save = vi.fn();
  await catchUpDays({
    today: "2026-10-15",
    anchors: [anchors[0]!],
    load: async ({ dayId }) =>
      lesson(dayId, dayId === 11 ? "2026-10-13" : "2026-10-19"),
    save,
    progress: vi.fn(),
  });
  expect(save).toHaveBeenCalledTimes(1);
});
it.each([
  new PursuitReadError("AUTH"),
  new PursuitReadError("SCHEMA"),
  new PursuitReadError("TIMEOUT"),
])(
  "stops on failed reads without retrying or erasing earlier imports: %s",
  async (error) => {
    const load = vi.fn(async ({ dayId }) => {
      if (dayId === 11) return lesson(11, "2026-10-13");
      if (dayId === 12) throw error;
      throw new CurriculumUnavailableError(404);
    });
    const save = vi.fn();
    await expect(
      catchUpDays({
        today: "2026-10-15",
        anchors,
        load,
        save,
        progress: vi.fn(),
      }),
    ).rejects.toBe(error);
    expect(save).toHaveBeenCalledTimes(1);
    expect(load.mock.calls.filter(([s]) => s.dayId <= 13)).toHaveLength(2);
  },
);
it("rejects mismatched identity and duplicate dates before saving", async () => {
  for (const bad of [
    lesson(99, "2026-10-13"),
    lesson(11, "2026-10-15"),
    { ...lesson(11, "2026-10-13"), source: "fixture" as const },
  ]) {
    const save = vi.fn();
    await expect(
      catchUpDays({
        today: "2026-10-15",
        anchors,
        load: async () => bad,
        save,
        progress: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(PursuitReadError);
    expect(save).not.toHaveBeenCalled();
  }
});
it("fails closed before network activity for missing anchors or an excessive scan", async () => {
  const load = vi.fn();
  for (const selected of [[], [{ ...anchors[0]!, date: "2020-01-01" }]]) {
    await expect(
      catchUpDays({
        today: "2026-10-15",
        anchors: selected,
        load,
        save: vi.fn(),
        progress: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(PursuitReadError);
  }
  expect(load).not.toHaveBeenCalled();
});

it("continues past inaccessible candidate IDs to fetch Oct 12–14 even with today already saved", async () => {
  const selected = [
    { date: "2026-10-08", dayId: 1648, cohort },
    { date: "2026-10-15", dayId: 1666, cohort },
  ];
  const progress = vi.fn();
  const save = vi.fn();
  const load = vi.fn(async ({ dayId }) => {
    if (dayId === 1660) return lesson(dayId, "2026-10-12");
    if (dayId === 1661) return lesson(dayId, "2026-10-13");
    if (dayId === 1662) return lesson(dayId, "2026-10-14");
    throw new CurriculumUnavailableError(403);
  });
  const result = await catchUpDays({
    today: "2026-10-15",
    anchors: selected,
    load,
    save,
    progress,
  });
  expect(save.mock.calls.map(([day]) => day.date)).toEqual([
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
  ]);
  expect(result.imported).toBe(3);
  expect(result.inaccessible).toBeGreaterThan(0);
  expect(progress).toHaveBeenCalledWith(
    expect.stringContaining("inaccessible"),
  );
  expect(load.mock.calls.length).toBeLessThanOrEqual(500);
});
it("scans far enough beyond Oct 8 to discover missed days whose IDs are more than 14 ahead", async () => {
  const save = vi.fn();
  await catchUpDays({
    today: "2026-10-15",
    anchors: [{ date: "2026-10-08", dayId: 1648, cohort }],
    load: async ({ dayId }) => {
      if (dayId === 1670) return lesson(dayId, "2026-10-13");
      throw new CurriculumUnavailableError(403);
    },
    save,
    progress: vi.fn(),
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]![0].date).toBe("2026-10-13");
});
