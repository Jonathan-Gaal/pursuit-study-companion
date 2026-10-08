import { it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDay } from "../src/pursuit/parser.js";
import { classify } from "../src/classification/index.js";
import { ReadOnlyHttpClient } from "../src/pursuit/http.js";
import { LivePursuitClient } from "../src/pursuit/liveClient.js";
import { projectRoot } from "../src/config/index.js";
import { daySelection } from "../src/config/daySelection.js";
const selection = { dayId: 1626, cohort: "L2 - September 2026" };
async function capture() {
  return JSON.parse(
    await readFile(
      resolve(projectRoot, "fixtures/captured-day-1626.json"),
      "utf8",
    ),
  );
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("parses the captured ISO day date and nine tasks without duplicating the two views", async () => {
  const day = parseDay(await capture());
  expect(day.date).toBe("2026-09-28");
  expect(day.tasks).toHaveLength(9);
  expect(day.warnings).toEqual([]);
  expect(classify(day.tasks.find((t) => t.id === 9881)!).classification).toBe(
    "IGNORE",
  );
  expect(classify(day.tasks.find((t) => t.id === 9882)!).classification).toBe(
    "LEARNING",
  );
  expect(classify(day.tasks.find((t) => t.id === 9885)!).requiresUser).toBe(
    true,
  );
  expect(day.tasks.find((t) => t.id === 9886)!.protectedKind).toBeNull();
});
it("supports nested task_title/task_description/task_type aliases", async () => {
  const input = await capture();
  delete input.flattenedTasks;
  const day = parseDay(input);
  expect(day.tasks).toHaveLength(9);
  expect(day.tasks[0]!.title).toBe("Daily Stand-up");
});
it("respects assessment metadata in either view even if the other view is ordinary", async () => {
  const input = await capture();
  input.timeBlocks[0].tasks[0].assessment_id = 7;
  const day = parseDay(input);
  expect(day.tasks[0]!.protectedKind).toBe("ASSESSMENT");
  expect(day.tasks[0]!.text).toBe("");
  input.timeBlocks[0].tasks[0].assessment_id = null;
  input.timeBlocks[0].tasks[0].task_title = "Weekly Survey";
  expect(parseDay(input).tasks[0]!.protectedKind).toBe("WEEKLY_SURVEY");
});
it("allows only verified full-details query shapes", async () => {
  const fetch = vi.fn(async () => json(await capture()));
  const http = new ReadOnlyHttpClient(
    { getToken: () => "synthetic-local-test" },
    fetch,
  );
  await http.request(
    "GET",
    "/api/curriculum/days/1626/full-details?cohort=L2%20-%20September%202026",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  for (const path of [
    "/api/curriculum/days/1626/full-details",
    "/api/curriculum/days/1626/full-details?cohort=",
    "/api/curriculum/days/1626/full-details?cohort=L2&write=true",
    "/api/curriculum/days/1626/full-details?cohort=L2#fragment",
  ])
    await expect(http.request("GET", path)).rejects.toMatchObject({
      code: "BLOCKED",
    });
});
it("loads exactly the selected day then GETs all individual statuses without trusting flattened completed flags", async () => {
  const fetch = vi.fn(async (url: string) =>
    url.includes("full-details")
      ? json(await capture())
      : json({ isComplete: url.endsWith("/9882") }),
  );
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-local-test" }, fetch),
    selection,
  );
  const day = await client.loadDay();
  expect(day.date).toBe("2026-09-28");
  expect(day.source).toBe("live");
  expect(day.tasks.find((t) => t.id === 9882)!.completed).toBe(true);
  expect(day.tasks.find((t) => t.id === 9885)!.completed).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(10);
});
it("stops before status reads when day identity or cohort does not match selection", async () => {
  const input = await capture();
  input.day.id = 999;
  const fetch = vi.fn(async () => json(input));
  const client = new LivePursuitClient(
    new ReadOnlyHttpClient({ getToken: () => "synthetic-local-test" }, fetch),
    selection,
  );
  await expect(client.loadDay()).rejects.toMatchObject({ code: "SCHEMA" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("requires explicit day selection and never assumes 1626 is today", () => {
  expect(() => daySelection({})).toThrow("configure confirmed PURSUIT_DAY_IDS");
  expect(
    daySelection({ PURSUIT_DAY_ID: "1626", PURSUIT_COHORT: selection.cohort }),
  ).toEqual(selection);
});

it("completed genuine work remains protected without creating a pending action", async () => {
  const { dailyRun } = await import("../src/dailyRun.js");
  const { mkdtemp, mkdir } = await import("node:fs/promises");
  const { loadState } = await import("../src/state/store.js");
  await mkdir(resolve(projectRoot, ".test-output"), { recursive: true });
  const root = await mkdtemp(resolve(projectRoot, ".test-output/complete-"));
  const day = parseDay(await capture());
  day.source = "live";
  for (const task of day.tasks) task.completed = task.type !== "break";
  const result = await dailyRun(
    { root, dryRun: true, mode: "live", fixturePath: "unused" },
    { loadDay: async () => day },
  );
  const state = await loadState(root);
  expect(state.tasks["9885"]!.status).toBe("READ_ONLY");
  expect(state.tasks["9885"]!.classification.requiresUser).toBe(true);
  expect(result.report).toContain("COMPLETE — no pending action requested");
});
