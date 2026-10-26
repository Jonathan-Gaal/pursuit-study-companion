import { savedStudyAdditions } from "./studyExpansion.js";
import { withStudyAdditions } from "./studySections.js";
import type { HistoryStore } from "../history/store.js";
import { safeHistoryText } from "../history/store.js";
import { readLibraryNote } from "./library.js";
import { validDate } from "../pursuit/parser.js";
import { mkdir, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface ExportFile {
  path: string;
  content: string;
}
export async function obsidianExport(
  root: string,
  history: HistoryStore,
  date?: string,
) {
  if (date && (!validDate(date) || !history.day(date)))
    throw new Error("Choose a saved day.");
  const files: ExportFile[] = [];
  const warnings: string[] = [];
  let bytes = 0;
  const days = history.listDays();
  const selected = date
    ? days.filter((day) => day.date === date)
    : days.slice(0, 365);
  if (!date && days.length > 365)
    warnings.push("Export limited to the newest 365 saved days.");
  for (const day of selected) {
    const dayDate = String(day.date);
    let note: string | null;
    try {
      note = await readLibraryNote(root, dayDate);
    } catch {
      warnings.push(`${day.date}: note could not be read safely.`);
      continue;
    }
    if (!note) {
      warnings.push(`${day.date}: no saved Markdown note.`);
      continue;
    }
    note = withStudyAdditions(note, await savedStudyAdditions(root, dayDate));
    const saved = history.day(dayDate)!;
    const protectedIds = new Set(
      saved.tasks
        .filter((task) => task.protected_kind)
        .map((task) => Number(task.task_id)),
    );
    // Exclude protected assignment sections; preserve ordinary notes and fenced examples.
    const lines = note.split("\n");
    let blocked = false,
      fence: string | undefined;
    note = lines
      .filter((line, index) => {
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
          if (!fence) fence = marker;
          else if (marker[0] === fence[0] && marker.length >= fence.length)
            fence = undefined;
          return !blocked;
        }
        if (!fence && /^#{1,3}\s/.test(line)) {
          const next = lines
            .slice(index + 1, index + 5)
            .find((text) => text.trim());
          const id = /^Task ([1-9]\d*)\.?\s*$/.exec(next ?? "")?.[1];
          blocked =
            /assessment|weekly survey/i.test(line) ||
            !!(id && protectedIds.has(Number(id)));
        }
        return !blocked;
      })
      .join("\n");
    // Turn dashboard-relative links into usable local-app URLs; external references stay intact.
    note = note.replace(/\]\(\/\?([^\s)]+)\)/g, "](http://127.0.0.1:4782/?$1)");
    const annotation = safeHistoryText(
      String(history.annotation(dayDate).text ?? ""),
    );
    const content = `---\ntitle: "Daily Learning — ${day.date}"\ndate: ${day.date}\ntags:\n  - pursuit\n  - study-notes\nsource: pursuit-study-companion\n---\n\n${note.trim()}\n${annotation ? `\n## Personal annotations\n\n${annotation}\n` : ""}`;
    bytes += Buffer.byteLength(content);
    if (bytes > 8 * 1024 * 1024) {
      warnings.push(
        "Export reached the 8 MB limit; remaining notes were skipped.",
      );
      break;
    }
    files.push({ path: `Pursuit/Daily/${day.date}.md`, content });
  }
  const notes = files.map((file) =>
    file.path.split("/").at(-1)!.replace(/\.md$/, ""),
  );
  files.push({
    path: "Pursuit/Index.md",
    content: `# Pursuit study notes\n\n${notes.map((day) => `- [[Pursuit/Daily/${day}|${day}]]`).join("\n")}\n`,
  });
  files.push({
    path: "Pursuit/Import instructions.md",
    content:
      "# Import into Obsidian\n\nExtract this archive, then copy the Pursuit folder into your vault when ready. No plugins are required. Nothing connects to or writes into a vault automatically.\n\nKeep your own edits separate before importing again: importing the same file names may replace your edits. Dates use stable file names. The Index uses Obsidian wiki links. Links to the learning app require the local dashboard to be running on port 4782. Original resource links open their provider.\n",
  });
  return {
    files,
    noteCount: notes.length,
    warnings,
    connected: false as const,
  };
}

export async function prepareObsidianArchive(
  root: string,
  files: ExportFile[],
) {
  for (const path of [
    resolve(root, ".runtime"),
    resolve(root, ".runtime/obsidian-exports"),
  ]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe export directory");
  }
  const path = resolve(
    root,
    `.runtime/obsidian-exports/pursuit-${randomUUID()}.zip`,
  );
  await writeFile(path, zipExport(files), { flag: "wx", mode: 0o600 });
  return path;
}

/** Standard uncompressed ZIP, using only UTF-8 stable relative file names. */
export function zipExport(files: ExportFile[]): Buffer {
  const local: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    if (
      !/^Pursuit\/(?:Daily\/\d{4}-\d{2}-\d{2}|Index|Import instructions)\.md$/.test(
        file.path,
      )
    )
      throw new Error("Invalid export path");
    const name = Buffer.from(file.path),
      data = Buffer.from(file.content);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    local.push(header, name, data);
    directory.push(central, name);
    offset += header.length + name.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
