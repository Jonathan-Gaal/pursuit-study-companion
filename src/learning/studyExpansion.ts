import { detectProtection } from "../pursuit/protection.js";
import { open, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { existingStudyNote } from "./noteStore.js";
import { studySections } from "./studySections.js";
import {
  generateStudyAddition,
  parseStudyAddition,
  type StudyAddition,
} from "../ai/studyExpansion.js";
import type { HistoryStore } from "../history/store.js";
import { safeHistoryText } from "../history/store.js";

export interface SavedStudyAddition extends StudyAddition {
  section: string;
  createdAt: string;
}
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function assertNovel(
  addition: StudyAddition,
  existing: string,
  prior: SavedStudyAddition[],
) {
  const covered = new Set(prior.flatMap((p) => p.concepts).map(normalize));
  const concepts = addition.concepts.map(normalize);
  if (
    new Set(concepts).size !== concepts.length ||
    concepts.some((c) => covered.has(c))
  )
    throw new Error(
      "The model repeated an existing subtopic. No expansion was saved.",
    );
  const old = normalize(
    existing + " " + prior.map((p) => p.markdown).join(" "),
  );
  const paragraphs = addition.markdown
    .split(/\n\s*\n/)
    .map(normalize)
    .filter((p) => p.length > 100);
  if (paragraphs.some((p) => old.includes(p)))
    throw new Error(
      "The model repeated existing notes. No expansion was saved.",
    );
}
async function readSafe(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
      throw new Error("Unsafe study file");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
export async function savedStudyAdditions(
  root: string,
  date: string,
): Promise<SavedStudyAddition[]> {
  const note = await existingStudyNote(root, date);
  if (!note) return [];
  try {
    const data: unknown = JSON.parse(await readSafe(`${note}.expansions.json`));
    if (!Array.isArray(data) || data.length > 100)
      throw new Error("Invalid saved expansions");
    return data.map((v) => {
      if (
        !v ||
        typeof v.section !== "string" ||
        typeof v.createdAt !== "string"
      )
        throw new Error("Invalid saved expansion");
      return {
        ...parseStudyAddition(v),
        section: v.section,
        createdAt: v.createdAt,
      };
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function expandStudy(
  root: string,
  history: HistoryStore,
  date: string,
  sectionKey: string,
  generate = generateStudyAddition,
) {
  const note = await existingStudyNote(root, date);
  const day = history.day(date);
  if (!note || !day) throw new Error("Saved study notes are required.");
  const lockPath = `${note}.expansion.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      "A study expansion is already running. Wait for it to finish.",
    );
  }
  let temporary: string | undefined;
  try {
    const original = await readSafe(note);
    const sections = studySections(original);
    const allowed = (s: ReturnType<typeof studySections>[number]) =>
      !detectProtection({ title: s.title }) &&
      s.taskIds.every((id) =>
        day.tasks.some((t) => t.task_id === id && !t.protected_kind),
      );
    const section = sections.find((s) => s.key === sectionKey);
    if (!section || !section.taskIds.length || !allowed(section))
      throw new Error("This section is unavailable for AI expansion.");
    const prior = await savedStudyAdditions(root, date);
    if (prior.length >= 100)
      throw new Error("This day has reached its saved expansion limit.");
    // Fail closed rather than truncate the deduplication context.
    const safeNotes = sections
      .filter(allowed)
      .map((s) => s.text)
      .join("\n");
    const safePrior = prior.filter((p) =>
      sections.some((s) => s.key === p.section && allowed(s)),
    );
    const input = safeHistoryText(
      JSON.stringify({
        selectedSection: section,
        existingNotes: safeNotes,
        previousExpansions: safePrior,
      }),
    );
    const addition = parseStudyAddition(await generate(input));
    assertNovel(addition, original, prior);
    if (
      createHash("sha256")
        .update(await readSafe(note))
        .digest("hex") !== createHash("sha256").update(original).digest("hex")
    )
      throw new Error("Notes changed during generation. Please try again.");
    const next = [
      ...prior,
      { ...addition, section: sectionKey, createdAt: new Date().toISOString() },
    ];
    const serialized = JSON.stringify(next, null, 2);
    if (Buffer.byteLength(serialized) > 2 * 1024 * 1024)
      throw new Error("Saved expansions exceed size limit.");
    temporary = `${note}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(serialized);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, `${note}.expansions.json`);
    return next;
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}
