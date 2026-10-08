import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HistoryStore } from "../src/history/store.js";
import { emptyState } from "../src/state/store.js";
import {
  obsidianExport,
  zipExport,
  prepareObsidianArchive,
} from "../src/learning/obsidian.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "pursuit-obsidian-"));
  roots.push(root);
  const history = new HistoryStore(root),
    state = emptyState();
  state.days["2026-10-06"] = {
    note: "study-notes/2026-10-06.md",
    conceptIds: [],
    taskIds: [],
  };
  history.importState(state);
  await mkdir(join(root, "study-notes"));
  return { root, history };
}
describe("optional Obsidian export", () => {
  it("previews dated notes, linked index and annotations without changing source", async () => {
    const { root, history } = await workspace();
    try {
      const original = "# Daily Learning\n\n## APIs\nUseful notes.\n";
      await writeFile(join(root, "study-notes/2026-10-06.md"), original);
      history.saveAnnotation("2026-10-06", "My learning reminder", 0);
      const result = await obsidianExport(root, history);
      expect(result.connected).toBe(false);
      expect(result.noteCount).toBe(1);
      expect(result.files[0]?.content).toContain("date: 2026-10-06");
      expect(result.files[0]?.content).toContain("My learning reminder");
      expect(result.files[1]?.content).toContain(
        "[[Pursuit/Daily/2026-10-06|2026-10-06]]",
      );
      expect(
        await readFile(join(root, "study-notes/2026-10-06.md"), "utf8"),
      ).toBe(original);
    } finally {
      history.close();
    }
  });
  it("omits protected sections while retaining subsequent ordinary concepts", async () => {
    const { root, history } = await workspace();
    try {
      await writeFile(
        join(root, "study-notes/2026-10-06.md"),
        "# Daily Learning\n\n### Assessment\n\nPrivate questions\n#### Answers\nSensitive answers\n## APIs\nPublic concept\n",
      );
      const result = await obsidianExport(root, history);
      expect(result.files[0]?.content).not.toContain("Private questions");
      expect(result.files[0]?.content).not.toContain("Sensitive answers");
      expect(result.files[0]?.content).toContain("Public concept");
    } finally {
      history.close();
    }
  });
  it("reports missing notes and rejects invalid dates", async () => {
    const { root, history } = await workspace();
    try {
      const result = await obsidianExport(root, history);
      expect(result.noteCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      await expect(
        obsidianExport(root, history, "../../secret"),
      ).rejects.toThrow();
    } finally {
      history.close();
    }
  });
  it("creates a ZIP only on explicit preparation, with unique archives", async () => {
    const { root, history } = await workspace();
    try {
      const files = [
        {
          path: "Pursuit/Daily/2026-10-06.md",
          content: "# Unicode notes — ✓\n",
        },
      ];
      const first = await prepareObsidianArchive(root, files),
        second = await prepareObsidianArchive(root, files);
      expect(first).not.toBe(second);
      const zip = await readFile(first);
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
      expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
      expect(zip.includes(Buffer.from(files[0]!.content))).toBe(true);
      expect(() =>
        zipExport([{ path: "../escape.md", content: "bad" }]),
      ).toThrow();
    } finally {
      history.close();
    }
  });
  it("refuses symlinked export directories", async () => {
    const { root, history } = await workspace();
    try {
      await symlink(join(root, "study-notes"), join(root, ".runtime"));
      await expect(prepareObsidianArchive(root, [])).rejects.toThrow(
        "Unsafe export directory",
      );
    } finally {
      history.close();
    }
  });
});
