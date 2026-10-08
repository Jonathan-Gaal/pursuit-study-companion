import { expect, it } from "vitest";
import {
  studyTarget,
  assignmentAtHeading,
} from "../dashboard/lib/studyTarget.js";

it("identifies assignment titles without linking concept headings or curriculum subheadings", () => {
  const markdown =
    "### API lesson\n\nTask 10\n### Core Idea\nExplain APIs.\n## API Validation\nTask 10";
  expect(assignmentAtHeading(markdown, 1)).toBe(10);
  expect(assignmentAtHeading(markdown, 4)).toBeNull();
  expect(assignmentAtHeading(markdown, 6)).toBeNull();
});

it("jumps to a shared concept that cites the exact task", () => {
  const markdown =
    "## Assignment Notes\n### API lesson\nTask 10\n## API Validation\n### Core Idea\nValidate input.\n### Pursuit Source\n- [Task 10](/?date=2026-10-06&lesson=10): API lesson\n- Task 11: Another lesson";
  expect(studyTarget(markdown, 10)).toBe("study-heading-4");
  expect(studyTarget(markdown, 11)).toBe("study-heading-4");
  expect(studyTarget(markdown, 1)).toBeNull();
});

it("falls back to curriculum notes and ignores task references in code examples", () => {
  const markdown =
    "## Assignment Notes\n### Mentor Check-in\nTask 25\n```text\n## Fake concept\n### Pursuit Source\nTask 25\n```";
  expect(studyTarget(markdown, 25)).toBe("study-heading-2");
  expect(studyTarget(markdown, 99)).toBeNull();
});
