import { describe, it, expect } from "vitest";
import {
  extractTaskAssets,
  safeResourceUrl,
  parseTaskAssets,
  manualAssignmentReason,
} from "../src/learning/taskAssets.js";
import { parseDay } from "../src/pursuit/parser.js";
import { classify } from "../src/classification/index.js";

const task = (text: string) => ({
  text,
  protectedKind: null,
  deliverableType: null,
});
describe("assignment resources and manual deliverables", () => {
  it("keeps resource-only lessons eligible and deduplicates labeled links", () => {
    const assets = extractTaskAssets(
      task(
        "Read [Study guide](https://docs.google.com/document/d/example/edit).\nReference: https://docs.google.com/document/d/example/edit",
      ),
    );
    expect(assets.resources).toEqual([
      {
        url: "https://docs.google.com/document/d/example/edit",
        label: "Study guide",
      },
    ]);
    expect(assets.manualRequired).toBe(false);
  });
  it("records submission destinations and required work", () => {
    const assets = extractTaskAssets(
      task(
        "Create a Google Doc outlining your architecture.\nSubmit here: https://forms.gle/example",
      ),
    );
    expect(assets.submissionLinks).toHaveLength(1);
    expect(assets.requirements[0]).toContain("Google Doc");
    expect(assets.manualRequired).toBe(true);
  });
  it("extracts structured resources and submission URLs from metadata", () => {
    const assets = extractTaskAssets(task("Read the lesson."), [
      {
        resources: [
          {
            title: "Guide",
            url: "https://drive.google.com/file/d/example/view",
          },
        ],
        submission_url: "https://example.org/submit",
      },
    ]);
    expect(assets.resources[0]?.label).toBe("Guide");
    expect(assets.submissionLinks[0]?.url).toBe("https://example.org/submit");
    expect(assets.provenance).toBe("live-metadata");
  });
  it("does not index any protected task content or metadata", () => {
    for (const protectedKind of ["ASSESSMENT", "WEEKLY_SURVEY"] as const) {
      const assets = extractTaskAssets(
        {
          ...task("Submit a repository https://example.org/private"),
          protectedKind,
        },
        [{ submission_url: "https://example.org/private" }],
      );
      expect(assets.manualRequired).toBe(false);
      expect(assets.resources).toEqual([]);
      expect(assets.submissionLinks).toEqual([]);
    }
  });
  it("rejects unsafe links and malformed snapshots", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://user:secret@example.org",
      "https://example.org/?access_token=secret",
    ])
      expect(safeResourceUrl(url)).toBeNull();
    expect(parseTaskAssets('{"resources":[]}')).toBeNull();
  });
  it("manual requirements override routine classification", () => {
    const day = parseDay({
      date: "2026-10-06",
      flattenedTasks: [
        {
          id: 100,
          title: "Daily check-in",
          description: "Provide the deployed application URL.",
        },
      ],
    });
    expect(manualAssignmentReason(day.tasks[0]!)).toContain("blocked");
    expect(classify(day.tasks[0]!).classification).toBe("DELIVERABLE");
  });
});
