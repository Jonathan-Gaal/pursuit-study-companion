import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ReadOnlyHttpClient, PURSUIT_ORIGIN } from "../src/pursuit/http.js";
import { LivePursuitClient } from "../src/pursuit/liveClient.js";
import { EnvironmentTokenSource } from "../src/pursuit/auth.js";
import {
  parseCompletion,
  enrichCompletion,
} from "../src/pursuit/completion.js";
import { PursuitReadError } from "../src/pursuit/errors.js";
import { parseDay } from "../src/pursuit/parser.js";
import { parseArgs, projectRoot } from "../src/config/index.js";
import { dailyRun } from "../src/dailyRun.js";
import { loadState } from "../src/state/store.js";
import { classify } from "../src/classification/index.js";
import { LocalProvider } from "../src/ai/localProvider.js";
const synthetic = ["synthetic", "test", "credential"].join("-");
const tokens = { getToken: () => synthetic };
const completed = {
  isComplete: true,
  reason: "Conclusion reached + deliverable",
  taskMode: "conversation",
  requiresDeliverable: true,
  shouldAnalyze: true,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("strict HTTP read-only boundary", () => {
  it.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
    "get",
    "post",
    "GET ",
    "TRACE",
  ])("blocks %s before fetch or authentication", async (method) => {
    const fetch = vi.fn();
    const getToken = vi.fn(() => synthetic);
    const http = new ReadOnlyHttpClient({ getToken }, fetch);
    await expect(
      http.request(method, "/api/learning/task-completion-status/9675"),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    expect(fetch).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });
  it.each([
    "/api/submissions",
    "/api/submissions/9675",
    "https://other.example/api/learning/task-completion-status/9675",
    "//other.example/path",
    "/api/learning/task-completion-status/9675?redirect=other",
    "/api/learning/task-completion-status/../submissions",
    "/api/learning/task-completion-status/0",
  ])("blocks unallowlisted path %s", async (path) => {
    const fetch = vi.fn();
    const http = new ReadOnlyHttpClient(tokens, fetch);
    await expect(http.request("GET", path)).rejects.toMatchObject({
      code: "BLOCKED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks request bodies even on GET", async () => {
    const fetch = vi.fn();
    await expect(
      new ReadOnlyHttpClient(tokens, fetch).request(
        "GET",
        "/api/learning/task-completion-status/9675",
        { content: "blocked" },
      ),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the exact known endpoint and never forwards a body or follows redirects", async () => {
    const fetch = vi.fn(async () => json(completed));
    const client = new LivePursuitClient(new ReadOnlyHttpClient(tokens, fetch));
    expect(await client.getCompletion(9675)).toMatchObject(completed);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `${PURSUIT_ORIGIN}/api/learning/task-completion-status/9675`,
    );
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: { Authorization: `Bearer ${synthetic}` },
    });
    expect(options).not.toHaveProperty("body");
  });
  it("does not guess a daily endpoint or fetch when discovery is blocked", async () => {
    vi.stubEnv("PURSUIT_DAY_ID", "");
    vi.stubEnv("PURSUIT_DAY_IDS", "");
    vi.stubEnv("PURSUIT_COHORT", "");
    const fetch = vi.fn();
    const client = new LivePursuitClient(new ReadOnlyHttpClient(tokens, fetch));
    await expect(client.loadDay()).rejects.toMatchObject({ code: "DISCOVERY" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects invalid identifiers without requests", async () => {
    const fetch = vi.fn();
    const client = new LivePursuitClient(new ReadOnlyHttpClient(tokens, fetch));
    for (const id of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(client.getCompletion(id)).rejects.toMatchObject({
        code: "BLOCKED",
      });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([301, 302, 307, 308])(
    "does not follow HTTP %i redirects",
    async (status) => {
      const fetch = vi.fn(
        async () =>
          new Response(null, {
            status,
            headers: { location: "https://other.example" },
          }),
      );
      await expect(
        new ReadOnlyHttpClient(tokens, fetch).request(
          "GET",
          "/api/learning/task-completion-status/1",
        ),
      ).rejects.toMatchObject({ code: "HTTP" });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("caps requests and never retries", async () => {
    const fetch = vi.fn(async () => json(completed));
    const http = new ReadOnlyHttpClient(tokens, fetch);
    for (let i = 0; i < 114; i++)
      await http.request(
        "GET",
        `/api/learning/task-completion-status/${i + 1}`,
      );
    await expect(
      http.request("GET", "/api/learning/task-completion-status/115"),
    ).rejects.toMatchObject({ code: "LIMIT" });
    expect(fetch).toHaveBeenCalledTimes(114);
  });
  it("bounds a stalled request and blocks further reads", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    const http = new ReadOnlyHttpClient(tokens, fetch);
    const assertion = expect(
      http.request("GET", "/api/learning/task-completion-status/1"),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
    expect(signal?.aborted).toBe(true);
    await expect(
      http.request("GET", "/api/learning/task-completion-status/2"),
    ).rejects.toMatchObject({ code: "LIMIT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled body stream", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      async () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const assertion = expect(
      new ReadOnlyHttpClient(tokens, fetch).request(
        "GET",
        "/api/learning/task-completion-status/1",
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
  });
  it("rejects oversized body streams without trusting content-length", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(" ".repeat(2 * 1024 * 1024 + 1), {
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      new ReadOnlyHttpClient(tokens, fetch).request(
        "GET",
        "/api/learning/task-completion-status/1",
      ),
    ).rejects.toMatchObject({ code: "LIMIT" });
  });
  it.each(["text/html", "text/plain"])(
    "rejects non-JSON %s responses",
    async (contentType) => {
      const fetch = vi.fn(
        async () =>
          new Response("not JSON", {
            headers: { "content-type": contentType },
          }),
      );
      await expect(
        new ReadOnlyHttpClient(tokens, fetch).request(
          "GET",
          "/api/learning/task-completion-status/1",
        ),
      ).rejects.toMatchObject({ code: "SCHEMA" });
    },
  );
  it.each([401, 403, 429])(
    "stops after HTTP %i without retrying",
    async (status) => {
      const fetch = vi.fn(async () => json({ error: synthetic }, status));
      const http = new ReadOnlyHttpClient(tokens, fetch);
      await expect(
        http.request("GET", "/api/learning/task-completion-status/1"),
      ).rejects.toBeInstanceOf(PursuitReadError);
      await expect(
        http.request("GET", "/api/learning/task-completion-status/2"),
      ).rejects.toMatchObject({ code: "LIMIT" });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("does not expose secrets or raw transport/server errors", async () => {
    const spy = vi.spyOn(console, "error");
    const log = vi.spyOn(console, "log");
    const fetch = vi.fn(async () => {
      throw new Error(`transport failure ${synthetic}`);
    });
    const http = new ReadOnlyHttpClient(tokens, fetch);
    const error = await http
      .request("GET", "/api/learning/task-completion-status/1")
      .catch((e) => e);
    expect(error).toBeInstanceOf(PursuitReadError);
    expect((error as Error).message).not.toContain(synthetic);
    expect((error as Error).cause).toBeUndefined();
    expect(JSON.stringify(http)).not.toContain(synthetic);
    expect(spy).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
describe("configuration and completion parsing", () => {
  it("selects live by default and fixture only explicitly", () => {
    expect(parseArgs(["--dry-run"]).mode).toBe("live");
    expect(parseArgs(["--dry-run", "--fixture"]).mode).toBe("fixture");
    expect(
      parseArgs(["--fixture-path", "fixtures/presentation-day.json"]).mode,
    ).toBe("fixture");
  });
  it("requires local authentication and rejects placeholders", () => {
    vi.stubEnv("PURSUIT_TOKEN", "");
    expect(() => new EnvironmentTokenSource().getToken()).toThrow(
      "local configuration",
    );
    vi.stubEnv("PURSUIT_TOKEN", "your_token_here");
    expect(() => new EnvironmentTokenSource().getToken()).toThrow();
    vi.stubEnv("PURSUIT_TOKEN", synthetic);
    expect(new EnvironmentTokenSource().getToken()).toBe(synthetic);
  });
  it("parses true and false as distinct reported completion states", () => {
    expect(parseCompletion(completed).isComplete).toBe(true);
    expect(parseCompletion({ isComplete: false }).isComplete).toBe(false);
  });
  it.each([
    {},
    null,
    [],
    { isComplete: "true" },
    { isComplete: 1 },
    { isComplete: true, reason: 42 },
    { isComplete: false, requiresDeliverable: "yes" },
  ])("fails closed for unexpected schema %j", (value) => {
    expect(() => parseCompletion(value)).toThrow(PursuitReadError);
  });
});
describe("offline integration of live status reads", () => {
  it("shows reported COMPLETE/INCOMPLETE/UNKNOWN, learns from complete tasks, and preserves protections", async () => {
    const input = JSON.parse(
      await readFile(
        resolve(projectRoot, "fixtures/presentation-day.json"),
        "utf8",
      ),
    );
    input.flattenedTasks.push(
      {
        id: 9684,
        title: "Assessment",
        questions: ["Do not process"],
        completed: true,
      },
      { id: 9685, title: "Weekly Survey", completed: false },
    );
    const day = parseDay(input);
    const fetch = vi.fn(async (url: string) => {
      const id = Number(url.split("/").pop());
      if (id === 9682) return json({ isComplete: "invalid" });
      return json({
        ...completed,
        isComplete: [9675, 9677, 9684].includes(id),
        requiresDeliverable: [9677, 9679, 9681].includes(id),
      });
    });
    const live = new LivePursuitClient(new ReadOnlyHttpClient(tokens, fetch));
    const enriched = await enrichCompletion(day, live);
    await mkdir(resolve(projectRoot, ".test-output"), { recursive: true });
    const root = await mkdtemp(resolve(projectRoot, ".test-output/live-mock-"));
    const provider = new LocalProvider();
    const result = await dailyRun(
      { root, dryRun: true, mode: "live", fixturePath: "unused" },
      { loadDay: async () => enriched },
      provider,
    );
    expect(result.report).toContain("Team presentation architecture: COMPLETE");
    expect(result.report).toContain("Build and deploy: COMPLETE");
    expect(result.report).toContain("Team storyboard: INCOMPLETE");
    expect(result.report).toContain("Retro: UNKNOWN");
    expect(result.report).toContain("→ Assessment — complete manually");
    expect(result.report).toContain("→ Weekly Survey — complete manually");
    expect(result.concepts.map((c) => c.id)).toContain(
      "team-presentation-architecture",
    );
    expect(
      result.tasks.find((t) => t.task.id === 9677)?.result.requiresUser,
    ).toBe(true);
    const state = await loadState(root);
    expect(state.tasks["9675"]!.completion).toBe(true);
    expect(state.tasks["9682"]!.completion).toBeNull();
    expect(state.tasks["9675"]!.completionSource).toBe("live");
    expect(fetch).toHaveBeenCalledTimes(day.tasks.length);
    for (const call of fetch.mock.calls)
      expect((call as unknown as [string, RequestInit])[1].method).toBe("GET");
    expect(await readFile(result.note, "utf8")).toContain(
      "Source: live Pursuit GET data",
    );
  });
  it("honors protection metadata discovered in completion responses before extraction", async () => {
    const day = parseDay({
      date: "2026-09-30",
      flattenedTasks: [{ id: 1, title: "Learn deployment", type: "learning" }],
    });
    const enriched = await enrichCompletion(day, {
      getCompletion: async () =>
        parseCompletion({ isComplete: false, assessment_id: 7 }),
    });
    expect(enriched.tasks[0]!.protectedKind).toBe("ASSESSMENT");
    expect(enriched.tasks[0]!.text).toBe("");
  });
  it("does not downgrade a known assessment to ordinary conversation", async () => {
    const day = parseDay({
      date: "2026-09-30",
      flattenedTasks: [{ id: 1, title: "Assessment" }],
    });
    const enriched = await enrichCompletion(day, {
      getCompletion: async () => parseCompletion(completed),
    });
    expect(enriched.tasks[0]!.protectedKind).toBe("ASSESSMENT");
  });
});

it("never removes assessment protection when a status mentions a weekly survey", async () => {
  const day = parseDay({
    date: "2026-09-30",
    flattenedTasks: [{ id: 1, title: "Assessment" }],
  });
  const enriched = await enrichCompletion(day, {
    getCompletion: async () =>
      parseCompletion({ isComplete: false, taskMode: "weekly_survey" }),
  });
  expect(enriched.tasks[0]!.protectedKind).toBe("ASSESSMENT");
});
it("blocks provider eligibility when a completion response is malformed", async () => {
  const day = parseDay({
    date: "2026-09-30",
    flattenedTasks: [{ id: 1, title: "Learn deployment", completed: true }],
  });
  const enriched = await enrichCompletion(day, {
    getCompletion: async () => {
      throw new PursuitReadError("SCHEMA");
    },
  });
  const task = enriched.tasks[0]!;
  expect(task.completed).toBeNull();
  expect(classify(task)).toMatchObject({
    classification: "NEEDS_USER",
    extractLearning: false,
    futureResponseCandidate: false,
  });
});
it("stops a whole status batch after authentication failure with bounded in-flight reads", async () => {
  const day = parseDay({
    date: "2026-09-30",
    flattenedTasks: Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: "Reflection",
      completed: true,
    })),
  });
  const reader = {
    getCompletion: vi.fn(async () => {
      throw new PursuitReadError("AUTH");
    }),
  };
  const enriched = await enrichCompletion(day, reader);
  expect(reader.getCompletion.mock.calls.length).toBeLessThanOrEqual(4);
  expect(
    enriched.tasks.every(
      (task) => task.completed === null && task.completionReadFailed,
    ),
  ).toBe(true);
});
it("reports CLI write flags as BLOCKED without fetching", () => {
  for (const flag of ["--submit", "--post", "--put", "--patch", "--delete"])
    expect(() => parseArgs([flag])).toThrow("BLOCKED");
});
