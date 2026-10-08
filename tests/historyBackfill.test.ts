import { expect, it, vi } from "vitest";
import {
  backfillHistory,
  type BackfillOptions,
} from "../src/history/backfill.js";
import {
  CurriculumCohortMismatchError,
  PursuitReadError,
} from "../src/pursuit/errors.js";
import { LivePursuitClient } from "../src/pursuit/liveClient.js";
import { ReadOnlyHttpClient } from "../src/pursuit/http.js";
import type { Day } from "../src/types/index.js";

const options: BackfillOptions = {
  from: "2026-07-06",
  through: "2026-10-08",
  minDay: 10,
  maxDay: 12,
  cohorts: ["L2 - September 2026", "L1 - September 2026"],
};
function day(id: number, cohort: string, date: string): Day {
  return { dayId: id, cohort, date, source: "live", tasks: [], warnings: [] };
}
it("scans backward using exact supplied cohorts and imports only in-range days", async () => {
  const load = vi.fn(async ({ dayId, cohort }) => {
    if (cohort === options.cohorts[0]) throw new PursuitReadError("NO_DAY");
    return day(
      dayId,
      cohort,
      { 12: "2026-10-09", 11: "2026-07-06", 10: "2026-07-05" }[
        dayId as 10 | 11 | 12
      ],
    );
  });
  const save = vi.fn();
  const result = await backfillHistory(options, {
    load,
    save,
    progress: vi.fn(),
  });
  expect(load.mock.calls.map(([selection]) => selection.dayId)).toEqual([
    12, 12, 11, 11, 10, 10,
  ]);
  expect(save).toHaveBeenCalledTimes(1);
  expect(result).toEqual({
    dates: ["2026-07-06"],
    reachedStart: true,
    unavailable: 3,
  });
});
it("rejects invalid dates and excessive scan bounds before GETs", async () => {
  const load = vi.fn();
  for (const overrides of [
    { from: "2026-02-30" },
    { through: "2026-07-05" },
    { minDay: 0 },
    { maxDay: 1000 },
    { cohorts: [] },
    { cohorts: ["L1", "L1"] },
    { cohorts: ["bad\ncohort"] },
  ]) {
    await expect(
      backfillHistory(
        { ...options, ...overrides },
        { load, save: vi.fn(), progress: vi.fn() },
      ),
    ).rejects.toThrow();
  }
  expect(load).not.toHaveBeenCalled();
});
it("stops immediately on transport, authentication, schema and quota errors without retry", async () => {
  for (const code of ["HTTP", "AUTH", "SCHEMA", "LIMIT", "TIMEOUT"] as const) {
    const load = vi.fn().mockRejectedValue(new PursuitReadError(code));
    const save = vi.fn();
    await expect(
      backfillHistory(options, { load, save, progress: vi.fn() }),
    ).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  }
});
it("rejects mismatched day identity, cohort, provenance and duplicate dates", async () => {
  for (const overrides of [
    { dayId: 99 },
    { cohort: "other" },
    { source: "fixture" as const },
  ]) {
    const save = vi.fn();
    await expect(
      backfillHistory(options, {
        load: async ({ dayId, cohort }) => ({
          ...day(dayId, cohort, options.from),
          ...overrides,
        }),
        save,
        progress: vi.fn(),
      }),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  }
  const save = vi.fn();
  await expect(
    backfillHistory(options, {
      load: async ({ dayId, cohort }) => day(dayId, cohort, options.from),
      save,
      progress: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(save).toHaveBeenCalledTimes(1);
});
it("reports partial coverage when the earliest requested date is absent", async () => {
  const result = await backfillHistory(options, {
    load: async () => {
      throw new PursuitReadError("NO_DAY");
    },
    save: vi.fn(),
    progress: vi.fn(),
  });
  expect(result.reachedStart).toBe(false);
  expect(result.dates).toEqual([]);
});
it("stops on an import error and does not skip ahead or retry", async () => {
  const load = vi.fn(async ({ dayId, cohort }) =>
    day(dayId, cohort, options.from),
  );
  const save = vi.fn().mockRejectedValue(new Error("Storage failure"));
  await expect(
    backfillHistory(options, { load, save, progress: vi.fn() }),
  ).rejects.toThrow("Storage failure");
  expect(load).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});

it("does not query a successfully imported day again under the other cohort", async () => {
  const load = vi.fn(async ({ dayId, cohort }) =>
    day(
      dayId,
      cohort,
      { 12: "2026-10-08", 11: "2026-10-07", 10: "2026-10-06" }[
        dayId as 10 | 11 | 12
      ],
    ),
  );
  await backfillHistory(options, { load, save: vi.fn(), progress: vi.fn() });
  expect(load.mock.calls.map(([selection]) => selection)).toEqual(
    [12, 11, 10].map((dayId) => ({ dayId, cohort: options.cohorts[0] })),
  );
});

it("switches only for explicitly identified configured historical cohorts", async () => {
  const load = vi.fn(async ({ dayId, cohort }) => {
    if (cohort === options.cohorts[0])
      throw new CurriculumCohortMismatchError(options.cohorts[1]!);
    return day(
      dayId,
      cohort,
      { 12: "2026-07-08", 11: "2026-07-07", 10: "2026-07-06" }[
        dayId as 10 | 11 | 12
      ],
    );
  });
  const save = vi.fn();
  const result = await backfillHistory(options, {
    load,
    save,
    progress: vi.fn(),
  });
  expect(result.reachedStart).toBe(true);
  expect(save).toHaveBeenCalledTimes(3);
  const unknown = vi
    .fn()
    .mockRejectedValue(new CurriculumCohortMismatchError("unknown"));
  await expect(
    backfillHistory(options, {
      load: unknown,
      save: vi.fn(),
      progress: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(unknown).toHaveBeenCalledTimes(1);
});

it("keeps normal live reads strict and permits only explicit historical cohort mismatch detection", async () => {
  const selection = { dayId: 12, cohort: options.cohorts[0]! };
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ day: { id: 12, cohort: options.cohorts[1] } }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
  );
  await expect(client.loadDefinitions(selection)).rejects.toBeInstanceOf(
    PursuitReadError,
  );
  await expect(
    client.loadDefinitions(selection, options.cohorts),
  ).rejects.toBeInstanceOf(CurriculumCohortMismatchError);
  await expect(
    client.loadDefinitions(selection, ["unknown"]),
  ).rejects.toBeInstanceOf(PursuitReadError);
});
