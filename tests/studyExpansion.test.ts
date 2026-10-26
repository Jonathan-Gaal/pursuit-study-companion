import { it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studySections } from "../src/learning/studySections.js";
import {
  assertNovel,
  expandStudy,
  savedStudyAdditions,
} from "../src/learning/studyExpansion.js";
import { generateStudyAddition } from "../src/ai/studyExpansion.js";
import { HistoryStore } from "../src/history/store.js";
import { emptyState } from "../src/state/store.js";
const addition = {
  concepts: ["Retry jitter"],
  markdown:
    "#### Retry jitter\n\n" +
    "Use randomized backoff to spread requests over time and reduce synchronized load during recovery. Include a maximum attempt count and avoid retrying non-idempotent writes.",
};
it("splits assignment and shared concept sections without splitting examples", () => {
  const sections = studySections(
    "# Daily\n## Assignment Notes\n### APIs\n\nTask 10\n```md\n## fake\n```\n## Retries\n### Pursuit Source\n- Task 10: APIs",
  );
  expect(sections.map((s) => s.title)).toEqual([
    "Daily",
    "Assignment Notes",
    "APIs",
    "Retries",
  ]);
  expect(sections[2]?.taskIds).toEqual([10]);
  expect(sections[2]?.line).toBe(3);
});
it("rejects repeated subtopics and copied explanations", () => {
  expect(() =>
    assertNovel(addition, "", [
      { ...addition, section: "x", createdAt: "now" },
    ]),
  ).toThrow(/subtopic/);
  expect(() => assertNovel(addition, addition.markdown, [])).toThrow(
    /repeated/,
  );
});
it("persists expansions, supplies prior context and excludes protected content", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-expansion-"));
  const history = new HistoryStore(root);
  try {
    history.recordDay(
      {
        date: "2026-10-26",
        warnings: [],
        tasks: [10, 11].map((id) => ({
          id,
          title: id === 11 ? "Assessment" : "APIs",
          text: "",
          type: "lesson",
          protectedKind: id === 11 ? "ASSESSMENT" : null,
          deliverableType: null,
          deliverableEvidence: false,
          uncertain: false,
          completed: false,
        })),
      },
      emptyState(),
    );
    await mkdir(join(root, "study-notes"));
    await writeFile(
      join(root, "study-notes/2026-10-26.md"),
      "# Daily\n### APIs\nTask 10\nExisting explanation\n### Assessment\nTask 11\nSECRET PROTECTED QUESTION",
    );
    const generate = vi.fn(async (_input: string) => addition);
    await expandStudy(root, history, "2026-10-26", "section-2", generate);
    expect(generate.mock.calls[0]?.[0]).not.toContain(
      "SECRET PROTECTED QUESTION",
    );
    expect(await savedStudyAdditions(root, "2026-10-26")).toHaveLength(1);
    await expect(
      expandStudy(root, history, "2026-10-26", "section-2", generate),
    ).rejects.toThrow(/subtopic/);
    expect(generate.mock.calls[1]?.[0]).toContain("Retry jitter");
    await expect(
      expandStudy(root, history, "2026-10-26", "section-5", generate),
    ).rejects.toThrow(/unavailable/);
    expect(generate).toHaveBeenCalledTimes(2);
  } finally {
    history.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("uses a single confirmed-free fallback on invalid Gemini output", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(addition) },
          },
        ],
      }),
    );
  expect(
    await generateStudyAddition(
      "existing notes",
      {
        GEMINI_API_KEY: "fake",
        GEMINI_FREE_TIER_CONFIRMED: "true",
        GROQ_API_KEY: "fake2",
        GROQ_FREE_TIER_CONFIRMED: "true",
      },
      fetcher,
    ),
  ).toEqual(addition);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not call unconfirmed providers or truncate large contexts", async () => {
  const fetcher = vi.fn();
  await expect(
    generateStudyAddition("notes", { GEMINI_API_KEY: "fake" }, fetcher),
  ).rejects.toThrow(/unavailable/);
  await expect(
    generateStudyAddition("x".repeat(180001), {}, fetcher),
  ).rejects.toThrow(/large/);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["ASSESSMENT", "WEEKLY_SURVEY"] as const)(
  "never sends %s section content to a provider",
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "study-protected-"));
    const history = new HistoryStore(root);
    try {
      history.recordDay(
        {
          date: "2026-10-26",
          warnings: [],
          tasks: [
            {
              id: 12,
              title: kind === "ASSESSMENT" ? "ASSESSMENT" : "Weekly Survey",
              text: "private content",
              type: "lesson",
              protectedKind: kind,
              deliverableType: null,
              deliverableEvidence: false,
              uncertain: false,
              completed: false,
            },
          ],
        },
        emptyState(),
      );
      await mkdir(join(root, "study-notes"));
      await writeFile(
        join(root, "study-notes/2026-10-26.md"),
        "# Daily\n### Protected section\nTask 12\nPrivate questions",
      );
      const generate = vi.fn(async () => addition);
      await expect(
        expandStudy(root, history, "2026-10-26", "section-2", generate),
      ).rejects.toThrow(/unavailable/);
      expect(generate).not.toHaveBeenCalled();
      expect(await savedStudyAdditions(root, "2026-10-26")).toEqual([]);
    } finally {
      history.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
