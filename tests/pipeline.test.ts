import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  stat,
  unlink,
} from "node:fs/promises";
import { resolve } from "node:path";
import { parseDay } from "../src/pursuit/parser.js";
import { classify } from "../src/classification/index.js";
import { extractConcepts, consolidate } from "../src/learning/concepts.js";
import { dailyRun } from "../src/dailyRun.js";
import {
  loadState,
  saveState,
  emptyState,
  maySubmit,
} from "../src/state/store.js";
import { redact } from "../src/reporting/security.js";
import { parseArgs, projectRoot } from "../src/config/index.js";
import { LocalProvider } from "../src/ai/localProvider.js";
import type { Task } from "../src/types/index.js";
import { sharedThreads } from "../src/learning/markdown.js";
const fixturePath = resolve(projectRoot, "fixtures/presentation-day.json");
async function fixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}
function task(values: Record<string, unknown>): Task {
  return parseDay({
    date: "2026-09-30",
    flattenedTasks: [{ id: 1, title: "Task", ...values }],
  }).tasks[0]!;
}
async function workspace() {
  await mkdir(resolve(projectRoot, ".test-output"), { recursive: true });
  return mkdtemp(resolve(projectRoot, ".test-output/run-"));
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("fixture normalization", () => {
  it("does not treat deliverable_type none as a requested deliverable", () => {
    expect(
      task({
        deliverable_type: "none",
        deliverable: "",
        deliverable_schema: null,
      }).deliverableEvidence,
    ).toBe(false);
  });
  it("parses realistic tasks including malformed display values", async () => {
    const day = parseDay(await fixture());
    expect(day.tasks).toHaveLength(8);
    expect(day.warnings).toEqual([]);
    expect(day.tasks.find((t) => t.id === 9675)?.completed).toBe(true);
  });
  it("supports nested time blocks and skips invalid task identities", () => {
    const day = parseDay({
      date: "2026-09-30",
      timeBlocks: [
        {
          tasks: [
            {
              id: 1,
              title: "Lesson",
              questions: [null, 10, { text: "Learn APIs" }],
            },
          ],
        },
        { id: 2, title: "Lunch", type: "break" },
        { tasks: [{ id: "bad", title: "bad" }] },
      ],
    });
    expect(day.tasks).toHaveLength(2);
    expect(day.warnings).toHaveLength(1);
  });
  it("rejects unknown daily schemas and invalid dates", () => {
    for (const value of [
      null,
      {},
      { date: "../escape", flattenedTasks: [] },
      { date: "2026-02-30", flattenedTasks: [] },
      { date: "2026-09-30" },
    ])
      expect(() => parseDay(value)).toThrow();
  });
  it("treats duplicate IDs and malformed artifact metadata conservatively", () => {
    const day = parseDay({
      date: "2026-09-30",
      flattenedTasks: [
        { id: 1, title: "Reflection" },
        { id: 1, title: "Lunch" },
      ],
    });
    expect(classify(day.tasks[0]!).requiresUser).toBe(true);
    expect(
      classify(task({ deliverable_type: { bad: true } })).requiresUser,
    ).toBe(true);
  });
});
describe("classification", () => {
  it("recognizes a personalized company-research lesson without requested research deliverables", () => {
    expect(
      classify(
        task({
          title: "How to Research a Company",
          task_mode: "personalized",
          deliverable_type: "none",
          description:
            "Learn where to research a company before an informational interview.",
        }),
      ).classification,
    ).toBe("LEARNING");
  });
  it("classifies all eight examples", async () => {
    expect(
      parseDay(await fixture()).tasks.map((t) => classify(t).classification),
    ).toEqual([
      "ROUTINE",
      "LEARNING",
      "DELIVERABLE",
      "DELIVERABLE",
      "ROUTINE",
      "DELIVERABLE",
      "ROUTINE",
      "IGNORE",
    ]);
  });
  it.each([
    "Provide the deployed application URL",
    "Share a Loom video link",
    "Submit the real storyboard document link",
    "Conduct user research and share results",
    "Record a walkthrough of the product",
    "Provide actual teammate feedback",
  ])("requires genuine work: %s", (description) => {
    const c = classify(task({ description }));
    expect(c.requiresUser).toBe(true);
    expect(c.externalArtifact).toBe(true);
    expect(c.futureResponseCandidate).toBe(false);
  });
  it("does not infer safe automation from a harmless title", () => {
    expect(
      classify(
        task({
          title: "Check-in",
          description: "Provide a deployed application URL",
        }),
      ).classification,
    ).toBe("DELIVERABLE");
    expect(
      classify(
        task({
          title: "Lunch",
          description: "Learn schema validation in this lesson",
        }),
      ).classification,
    ).toBe("LEARNING");
  });
  it("fails conservatively for unknown deliverable types or unknown intent", () => {
    expect(
      classify(task({ title: "Reflection", deliverable_type: "mystery" }))
        .requiresUser,
    ).toBe(true);
    expect(classify(task({ title: "Unclear activity" })).requiresUser).toBe(
      true,
    );
  });
  it("ignores an ordinary break", () => {
    expect(
      classify(task({ title: "Break", type: "break" })).extractLearning,
    ).toBe(false);
  });
});
describe("concepts and study material", () => {
  it("detects shared themes across assignments, excludes stand-ups and protected tasks, and ignores single occurrences", () => {
    const tasks = parseDay({
      date: "2026-10-05",
      flattenedTasks: [
        { id: 1, title: "What Is an Agent?" },
        { id: 2, title: "Build", description: "design-build-ai-agent" },
        {
          id: 3,
          title: "Daily Stand-up",
          description: "design-build-ai-agent",
        },
        { id: 4, title: "Company Research" },
        { id: 5, title: "Assessment", description: "design-build-ai-agent" },
      ],
    }).tasks;
    const threads = sharedThreads(
      consolidate(tasks.flatMap(extractConcepts)),
      tasks,
    );
    expect(threads).toEqual([
      { id: "agent-fundamentals", name: "What Is an Agent?", taskIds: [1, 2] },
    ]);
  });
  it.each([
    [
      "Morning Briefing Agent (Part I): Individual Build",
      "design-build-ai-agent",
      "agent-fundamentals",
    ],
    ["Hustle Hour: How to Research a Company", "", "company-research"],
    ["Work Style Discovery", "", "pair-working-agreements"],
    ["Weekly Feedback Report Reflection", "", "feedback-and-reflection"],
  ])("covers today's topic: %s", async (title, description, id) => {
    const concepts = extractConcepts(task({ title, description }));
    expect(concepts.map((concept) => concept.id)).toContain(id);
    const content = await new LocalProvider().generateDeepDive(
      concepts.find((concept) => concept.id === id)!,
    );
    expect(content.deepDive.length).toBeGreaterThan(200);
    expect(content.questions).toContain("?");
  });
  it("generates agent study material and consolidates lesson and debrief sources", async () => {
    const day = parseDay({
      date: "2026-10-05",
      flattenedTasks: [
        {
          id: 10019,
          title: "What Is an Agent?",
          task_mode: "personalized",
          v2_lesson_content:
            "An observe-decide-act loop distinguishes an agent from a bot.",
        },
        {
          id: 10020,
          title: "Team Debrief",
          intro: "Discuss the bot/prompt/skill/agent distinction.",
        },
      ],
    });
    const result = await dailyRun(
      { dryRun: true, fixturePath, root: await workspace() },
      { loadDay: async () => day },
    );
    expect(result.errors).toEqual([]);
    expect(result.concepts).toEqual([
      {
        id: "agent-fundamentals",
        name: "What Is an Agent?",
        taskIds: [10019, 10020],
      },
    ]);
    const markdown = await readFile(result.note, "utf8");
    expect(markdown).toContain("## What Is an Agent?");
    expect(markdown).toContain(
      "[Task 10019](/?date=2026-10-05&lesson=10019): What Is an Agent?",
    );
    expect(markdown).toContain(
      "[Task 10020](/?date=2026-10-05&lesson=10020): Team Debrief",
    );
    expect(markdown).toContain("## Common Threads");
    expect(markdown).toContain("**What Is an Agent?** — 2 assignments");
    expect(markdown).toContain("Shared-theme deep dive");
    expect(markdown).toContain("stopping");
  });
  it("extracts concepts from learning, routine and deliverable tasks", async () => {
    const tasks = parseDay(await fixture()).tasks;
    const concepts = consolidate(tasks.flatMap(extractConcepts));
    expect(concepts.map((c) => c.id)).toEqual([
      "deployment",
      "team-presentation-architecture",
    ]);
    expect(
      concepts.find((c) => c.id === "team-presentation-architecture")?.taskIds,
    ).toEqual([9675, 9679, 9680, 9681, 9682]);
  });
  it("normalizes aliases and deduplicates source IDs", () => {
    const concepts = consolidate([
      { id: "a", name: "presentation flow", taskIds: [1] },
      { id: "b", name: "handoffs", taskIds: [1, 2] },
      { id: "c", name: "Team Presentation Architecture", taskIds: [3] },
    ]);
    expect(concepts).toEqual([
      {
        id: "team-presentation-architecture",
        name: "Team Presentation Architecture",
        taskIds: [1, 2, 3],
      },
    ]);
  });
  it("supports technical, product, UX and professional topics", () => {
    expect(
      extractConcepts(
        task({
          description:
            "Learn API validation, database normalization, RICE prioritization and user research.",
        }),
      ),
    ).toHaveLength(4);
  });
  it("declines unsupported prose rather than inventing facts", async () => {
    await expect(
      new LocalProvider().generateDeepDive({
        id: "unknown",
        name: "unknown",
        taskIds: [],
      }),
    ).rejects.toThrow();
  });
});
describe("state and read-only pipeline", () => {
  it("includes every assignment except stand-ups and lunch, including unfamiliar and completed tasks", async () => {
    const day = parseDay({
      date: "2026-10-05",
      flattenedTasks: [
        {
          id: 1,
          title: "Daily Stand-up",
          description: "Excluded stand-up text",
        },
        {
          id: 2,
          title: "Lunch",
          type: "break",
          description: "Excluded lunch text",
        },
        {
          id: 3,
          title: "New Topic",
          description: "Unfamiliar curriculum worth reviewing",
          completed: true,
        },
        {
          id: 4,
          title: "Pair Formation",
          description: "Meet your new partner",
        },
        {
          id: 5,
          title: "Assessment",
          questions: ["Protected question must stay out"],
        },
        {
          id: 6,
          title: "Weekly Survey",
          questions: ["Protected survey must stay out"],
        },
      ],
    });
    const result = await dailyRun(
      { dryRun: true, fixturePath, root: await workspace() },
      { loadDay: async () => day },
    );
    const markdown = await readFile(result.note, "utf8");
    expect(markdown).toContain("### New Topic");
    expect(markdown).toContain("Unfamiliar curriculum worth reviewing");
    expect(markdown).toContain("### Pair Formation");
    expect(markdown).toContain("Assessment — complete manually");
    expect(markdown).toContain("Weekly Survey — complete manually");
    expect(markdown).not.toContain("Excluded stand-up text");
    expect(markdown).not.toContain("Excluded lunch text");
    expect(markdown).not.toContain("Protected question");
    expect(markdown).not.toContain("Protected survey");
    expect(result.report).toContain("Assignment notes: 4");
  });
  it("runs offline, generates full notes, and preserves known conversational facts on rerun", async () => {
    const root = await workspace();
    const network = vi.fn(() => {
      throw new Error("Network prohibited");
    });
    vi.stubGlobal("fetch", network);
    const first = await dailyRun({ dryRun: true, fixturePath, root });
    expect(first.errors).toEqual([]);
    expect(first.concepts).toHaveLength(2);
    const markdown = await readFile(first.note, "utf8");
    expect(markdown.match(/^## /gm)).toHaveLength(4);
    for (const section of [
      "Why this appeared today",
      "Core Idea",
      "Deep Dive",
      "How It Works",
      "Practical Example",
      "Trade-offs",
      "Common Failure Modes",
      "Connection to Real Development Work",
      "What I Need to Know at My Level",
      "What I Should Remember",
      "Questions I Should Be Able to Answer",
      "Pursuit Source",
    ])
      expect(markdown).toContain(`### ${section}`);
    expect(markdown).toContain("Task 9675");
    const state = await loadState(root);
    state.tasks["9680"]!.establishedFacts = {
      project: "inventory management app",
      stack: ["Next.js", "PostgreSQL"],
    };
    state.tasks["9680"]!.conversationTurns = 2;
    await saveState(root, state);
    const before = await stat(first.note);
    const provider = new LocalProvider();
    const extract = vi.spyOn(provider, "extractConcepts");
    const generate = vi.spyOn(provider, "generateDeepDive");
    const second = await dailyRun(
      { dryRun: true, fixturePath, root },
      undefined,
      provider,
    );
    expect(second.noteStatus).toBe("REUSED");
    expect(extract).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(await readFile(first.note, "utf8")).toBe(markdown);
    expect((await stat(first.note)).mtimeMs).toBe(before.mtimeMs);
    const updated = await loadState(root);
    expect(updated.days[first.date]?.conceptIds).toEqual(
      state.days[first.date]?.conceptIds,
    );
    await unlink(first.note);
    const third = await dailyRun({ dryRun: true, fixturePath, root });
    expect(third.noteStatus).toBe("CREATED");
    expect(third.concepts).toHaveLength(2);
    expect(updated.tasks["9680"]!.establishedFacts).toEqual(
      state.tasks["9680"]!.establishedFacts,
    );
    expect(updated.tasks["9680"]!.conversationTurns).toBe(2);
    expect(updated.tasks["9677"]!.status).toBe("NEEDS_USER");
    expect(
      Object.values(updated.tasks).every(
        (t) => t.submissionAttempts.length === 0,
      ),
    ).toBe(true);
    expect(first.report).toContain("0 — dry-run/read-only");
    expect(network).not.toHaveBeenCalled();
  });
  it("denies live mode and all submission permissions", async () => {
    await expect(
      dailyRun({ dryRun: false as true, fixturePath, root: await workspace() }),
    ).rejects.toThrow("requires dry-run");
    expect(maySubmit()).toBe(false);
    expect(() => parseArgs(["--live"])).toThrow();
    expect(parseArgs([]).dryRun).toBe(true);
    expect(() => parseArgs(["--fixture-path"])).toThrow();
  });
  it("rejects corrupt state instead of replacing user context", async () => {
    const root = await workspace();
    await mkdir(resolve(root, "state"));
    await writeFile(
      resolve(root, "state/tasks.json"),
      '{"version":1,"tasks":{"1":{}},"days":{}}',
    );
    await expect(loadState(root)).rejects.toThrow("preserve and review");
  });
  it("continues valid learning when another task has invalid identity", async () => {
    const root = await workspace();
    const input = await fixture();
    input.flattenedTasks.push({ id: null, title: "Bad" });
    const result = await dailyRun(
      { dryRun: true, fixturePath, root },
      { loadDay: async () => parseDay(input) },
    );
    expect(result.concepts).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });
  it("does not write through an output-directory symlink", async () => {
    const root = await workspace();
    const outside = await workspace();
    await symlink(outside, resolve(root, "study-notes"));
    await expect(dailyRun({ dryRun: true, fixturePath, root })).rejects.toThrow(
      "symlink",
    );
  });
});
describe("secret handling", () => {
  it("redacts explicit tokens, bearer credentials and JWT-shaped values", () => {
    const secret = ["synthetic", "credential", "for", "redaction"].join("-");
    const safe = redact(
      `${secret} Bearer placeholder-token PURSUIT_TOKEN=placeholder-token eyJhbGciOiJIUzI1NiJ9.cGF5bG9hZA.c2lnbmF0dXJl`,
      [secret],
    );
    expect(safe).not.toContain(secret);
    expect(safe).not.toContain("placeholder-token");
    expect(safe).not.toContain("eyJ");
  });
  it("does not persist configured secrets in notes, reports or task context", async () => {
    const secret = ["synthetic", "runtime", "secret"].join("-");
    vi.stubEnv("PURSUIT_TOKEN", secret);
    const root = await workspace();
    const state = emptyState();
    await saveState(root, state);
    const input = await fixture();
    input.flattenedTasks[1].title += ` ${secret}`;
    const result = await dailyRun(
      { dryRun: true, fixturePath, root },
      { loadDay: async () => parseDay(input) },
    );
    expect(result.report).not.toContain(secret);
    expect(await readFile(result.note, "utf8")).not.toContain(secret);
    expect(
      await readFile(resolve(root, "state/tasks.json"), "utf8"),
    ).not.toContain(secret);
  });
});

describe("resource guardrails", () => {
  it("rejects oversized task collections before processing", () => {
    const tasks = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      title: "Reflection",
    }));
    expect(() =>
      parseDay({ date: "2026-09-30", flattenedTasks: tasks }),
    ).toThrow("task count");
  });
  it("rejects external AI even when injected", async () => {
    const root = await workspace();
    const provider = new LocalProvider();
    Object.defineProperty(provider, "mode", { value: "external" });
    const generate = vi.spyOn(provider, "extractConcepts");
    await expect(
      dailyRun({ dryRun: true, fixturePath, root }, undefined, provider),
    ).rejects.toThrow("paid call and token budgets are zero");
    expect(generate).not.toHaveBeenCalled();
  });
  it("times out a hanging provider and prevents further calls without retries", async () => {
    const { RunBudget } = await import("../src/ai/budget.js");
    vi.useFakeTimers();
    try {
      const budget = new RunBudget();
      let aborted = false;
      const promise = budget.call(
        (signal) =>
          new Promise(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      );
      const assertion = expect(promise).rejects.toThrow("deadline");
      await vi.advanceTimersByTimeAsync(2001);
      await assertion;
      expect(aborted).toBe(true);
      const next = vi.fn(async () => []);
      await expect(budget.call(next)).rejects.toThrow("budget exhausted");
      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("caps provider output and disables subsequent calls", async () => {
    const { RunBudget } = await import("../src/ai/budget.js");
    const budget = new RunBudget();
    await expect(budget.call(async () => "x".repeat(60001))).rejects.toThrow(
      "output exceeds",
    );
    await expect(budget.call(async () => "small")).rejects.toThrow(
      "budget exhausted",
    );
  });
  it("caps provider calls", async () => {
    const { RunBudget } = await import("../src/ai/budget.js");
    const budget = new RunBudget();
    for (let i = 0; i < 112; i++) await budget.call(async () => null);
    await expect(budget.call(async () => null)).rejects.toThrow("call budget");
  });
  it("rejects oversized fixture files and nonregular inputs", async () => {
    const { readBoundedJson } = await import("../src/pursuit/boundedFile.js");
    const root = await workspace();
    const path = resolve(root, "large.json");
    await writeFile(path, " ".repeat(2 * 1024 * 1024 + 1));
    await expect(readBoundedJson(path)).rejects.toThrow("size limit");
    await expect(readBoundedJson(root)).rejects.toThrow();
  });
});

describe("oversized task isolation", () => {
  it("flags a deeply nested task without suppressing valid learning", () => {
    let nested: unknown = "text";
    for (let i = 0; i < 20; i++) nested = { nested };
    const day = parseDay({
      date: "2026-09-30",
      flattenedTasks: [
        { id: 1, title: "Deep task", questions: nested },
        { id: 2, title: "Learn deployment", type: "learning" },
      ],
    });
    expect(day.warnings).toHaveLength(1);
    expect(classify(day.tasks[0]!).requiresUser).toBe(true);
    expect(extractConcepts(day.tasks[1]!)).toHaveLength(1);
  });
  it("flags excessive text and truncates display titles", () => {
    const day = parseDay({
      date: "2026-09-30",
      flattenedTasks: [{ id: 1, title: "t".repeat(33000) }],
    });
    expect(day.tasks[0]!.title.length).toBe(500);
    expect(classify(day.tasks[0]!).requiresUser).toBe(true);
  });
});

it("independent watchdog terminates a stalled worker and cancels after successful exit", async () => {
  const { startWatchdog } = await import("../src/config/watchdog.js");
  vi.useFakeTimers();
  try {
    const terminate = vi.fn();
    const cancel = startWatchdog(terminate);
    await vi.advanceTimersByTimeAsync(30000);
    expect(terminate).toHaveBeenCalledTimes(1);
    cancel();
    const next = vi.fn();
    const stop = startWatchdog(next);
    stop();
    await vi.advanceTimersByTimeAsync(30000);
    expect(next).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
