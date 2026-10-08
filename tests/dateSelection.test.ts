import { it, expect, vi, afterEach } from "vitest";
import { localCalendarDate, exactDate } from "../src/config/calendar.js";
import { parseArgs } from "../src/config/index.js";
import { configuredDayIds } from "../src/config/daySelection.js";
import { parseDay } from "../src/pursuit/parser.js";
import { ReadOnlyHttpClient } from "../src/pursuit/http.js";
import { LivePursuitClient } from "../src/pursuit/liveClient.js";
const cohort = "L2 - September 2026";
it("falls back to L3 only for an unavailable current-day cohort and retains its identity", async () => {
  vi.stubEnv("PURSUIT_COHORT", cohort);
  const next = "L3 - September 2026";
  vi.stubEnv("PURSUIT_COHORT_CANDIDATES", next);
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("full-details")) {
      if (new URL(url).searchParams.get("cohort") === cohort)
        return new Response(null, { status: 404 });
      return json({
        ...sample(1646, "2026-10-06"),
        day: { id: 1646, day_date: "2026-10-06", cohort: next },
      });
    }
    return json({ isComplete: false });
  });
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
    undefined,
    { dayIds: [1646], now: () => new Date("2026-10-06T16:00:00Z") },
  );
  const day = await client.loadDay();
  expect(day.cohort).toBe(next);
  expect(day.sourcePath).toContain(encodeURIComponent(next));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("does not switch cohorts after authentication errors or for an explicit historical selection", async () => {
  vi.stubEnv("PURSUIT_COHORT", cohort);
  for (const historical of [false, true]) {
    const fetch = vi.fn(
      async () => new Response(null, { status: historical ? 404 : 401 }),
    );
    const client = new LivePursuitClient(
      new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
      historical ? { dayId: 1646, cohort } : undefined,
      { dayIds: [1646], now: () => new Date("2026-10-06T16:00:00Z") },
    );
    await expect(client.loadDay()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});
const sample = (id: number, date: string) => ({
  day: { id, day_date: date, cohort },
  flattenedTasks: [
    {
      id: 9910,
      title: "Learn API validation",
      type: "learning",
      completed: false,
    },
  ],
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("selects September 30 day 1628 exactly among multiple days", () => {
  expect(
    exactDate(
      [
        { dayId: 1626, date: "2026-09-28" },
        { dayId: 1628, date: "2026-09-30" },
        { dayId: 1629, date: "2026-10-01" },
      ],
      "2026-09-30",
    ).dayId,
  ).toBe(1628);
});
it("preserves the ISO curriculum calendar date without converting it through the machine zone", () => {
  expect(parseDay(sample(1628, "2026-09-30T04:00:00.000Z")).date).toBe(
    "2026-09-30",
  );
});
it("determines today in the configured local timezone rather than taking the UTC date", () => {
  const instant = new Date("2026-09-30T02:30:00Z");
  expect(localCalendarDate(instant, "America/New_York")).toBe("2026-09-29");
  expect(localCalendarDate(instant, "UTC")).toBe("2026-09-30");
  expect(
    localCalendarDate(new Date("2026-09-30T04:00:00Z"), "America/New_York"),
  ).toBe("2026-09-30");
});
it("handles DST boundaries and year boundaries", () => {
  expect(
    localCalendarDate(new Date("2026-11-01T04:30:00Z"), "America/New_York"),
  ).toBe("2026-11-01");
  expect(
    localCalendarDate(new Date("2027-01-01T02:00:00Z"), "America/New_York"),
  ).toBe("2026-12-31");
});
it("fails closed when no exact scheduled day exists", () => {
  expect(() =>
    exactDate(
      [
        { dayId: 1626, date: "2026-09-28" },
        { dayId: 1629, date: "2026-10-01" },
      ],
      "2026-09-30",
    ),
  ).toThrow("No Pursuit day scheduled for 2026-09-30");
});
it("rejects ambiguous dates instead of choosing the first match", () => {
  expect(() =>
    exactDate(
      [
        { dayId: 1628, date: "2026-09-30" },
        { dayId: 1630, date: "2026-09-30" },
      ],
      "2026-09-30",
    ),
  ).toThrow();
});
it("supports historical --day and rejects invalid overrides or mixing fixtures", () => {
  expect(parseArgs(["--dry-run", "--day", "1626"]).dayId).toBe(1626);
  for (const args of [
    ["--day"],
    ["--day", "0"],
    ["--day", "1626", "--day", "1628"],
    ["--fixture", "--day", "1626"],
  ])
    expect(() => parseArgs(args)).toThrow();
});
it("bounds confirmed ID discovery and never scans adjacent IDs", () => {
  expect(configuredDayIds({ PURSUIT_DAY_IDS: "1626,1628,1628" })).toEqual([
    1626, 1628,
  ]);
  expect(() =>
    configuredDayIds({
      PURSUIT_DAY_IDS: Array.from({ length: 15 }, (_, i) => String(i + 1)).join(
        ",",
      ),
    }),
  ).toThrow();
});
it("GETs confirmed full-details candidates, selects 1628, then fetches authoritative completion", async () => {
  vi.stubEnv("PURSUIT_COHORT", cohort);
  const fetch = vi.fn(async (url: string) =>
    url.includes("/days/1626/")
      ? json(sample(1626, "2026-09-28T04:00:00.000Z"))
      : url.includes("/days/1628/")
        ? json(sample(1628, "2026-09-30T04:00:00.000Z"))
        : json({ isComplete: true }),
  );
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
    undefined,
    {
      dayIds: [1626, 1628],
      now: () => new Date("2026-09-30T16:00:00Z"),
      timeZone: "America/New_York",
      expected: { date: "2026-09-30", dayId: 1628 },
    },
  );
  const day = await client.loadDay();
  expect(day.dayId).toBe(1628);
  expect(day.date).toBe("2026-09-30");
  expect(day.tasks[0]!.completed).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const call of fetch.mock.calls)
    expect((call as unknown as [string, RequestInit])[1].method).toBe("GET");
});
it("does not fetch completion when there is no matching date", async () => {
  vi.stubEnv("PURSUIT_COHORT", cohort);
  const fetch = vi.fn(async () =>
    json(sample(1626, "2026-09-28T04:00:00.000Z")),
  );
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
    undefined,
    { dayIds: [1626], now: () => new Date("2026-09-30T16:00:00Z") },
  );
  await expect(client.loadDay()).rejects.toThrow(
    "No Pursuit day scheduled for 2026-09-30",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("stops before processing if September 30 unexpectedly resolves to an ID other than 1628", async () => {
  vi.stubEnv("PURSUIT_COHORT", cohort);
  const fetch = vi.fn(async () =>
    json(sample(1626, "2026-09-30T04:00:00.000Z")),
  );
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-only" }, fetch),
    undefined,
    {
      dayIds: [1626],
      now: () => new Date("2026-09-30T16:00:00Z"),
      expected: { date: "2026-09-30", dayId: 1628 },
    },
  );
  await expect(client.loadDay()).rejects.toMatchObject({ code: "SCHEMA" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["POST", "PUT", "PATCH", "DELETE"])(
  "still blocks %s on full-details before fetching",
  async (method) => {
    const fetch = vi.fn();
    const http = new ReadOnlyHttpClient(
      { getToken: () => "synthetic-only" },
      fetch,
    );
    await expect(
      http.request(method, "/api/curriculum/days/1628/full-details?cohort=L2"),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    expect(fetch).not.toHaveBeenCalled();
  },
);
