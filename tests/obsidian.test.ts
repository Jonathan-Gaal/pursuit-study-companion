import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dashboardApi } from "../src/dashboard/api.js";
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

describe("manual Obsidian sync", () => {
  it("validates without writing, syncs the selected note, and preserves conflicts on retry", async () => {
    const { root, history } = await workspace();
    try {
      const date = "2026-10-06";
      const vault = join(root, "My Vault & café");
      const target = join(vault, "Pursuit", "Daily", `${date}.md`);
      await mkdir(join(vault, ".obsidian"), { recursive: true });
      await writeFile(
        join(root, "study-notes", `${date}.md`),
        "# Daily Learning",
      );

      const request = async (
        action: string,
        path = vault,
        requestedDate = date,
      ) => {
        const result = await dashboardApi(
          {
            method: "POST",
            url: `/api/obsidian/vault/${action}`,
            headers: {
              host: "localhost:4782",
              origin: "http://localhost:4782",
              "content-type": "application/json",
            },
          },
          {
            root,
            history,
            port: 4782,
            active: async () => null,
            progress: async () => null,
            start: async () => false,
            readJson: async () => ({ path, date: requestedDate }),
          },
        );
        if (!result) throw new Error("Obsidian API route was not handled.");
        return result;
      };

      expect((await request("validate")).status).toBe(200);
      await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await request("sync", root)).status).toBe(400);
      expect((await request("sync", vault, "../note")).status).toBe(400);
      const outside = join(root, "outside");
      await mkdir(outside);
      await symlink(outside, join(vault, "Pursuit"), "junction");
      expect((await request("sync")).status).toBe(409);
      await rm(join(vault, "Pursuit"), { recursive: true });

      const runs = await Promise.all([request("sync"), request("sync")]);
      expect(runs.map((run) => run.status)).toEqual([200, 200]);
      expect(
        runs.map((run) => (run.body as { created: number }).created).sort(),
      ).toEqual([0, 1]);
      expect((await request("sync")).body).toMatchObject({
        created: 0,
        unchanged: 1,
        notes: [
          {
            path: `Pursuit/Daily/${date}.md`,
            uri: `obsidian://open?path=${encodeURIComponent(await realpath(target))}`,
          },
        ],
      });
      expect(await readFile(target, "utf8")).toContain("# Daily Learning");
      await writeFile(target, "Edited in Obsidian");
      expect((await request("sync")).body).toMatchObject({
        created: 0,
        unchanged: 0,
        conflicts: [`Pursuit/Daily/${date}.md`],
        failed: [],
        notes: [],
      });
      expect(await readFile(target, "utf8")).toBe("Edited in Obsidian");
    } finally {
      history.close();
    }
  });
});
