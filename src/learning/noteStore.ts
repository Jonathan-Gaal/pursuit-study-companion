import { lstat, open, link, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { insideRoot } from "../config/index.js";
import { ensureOutputDir } from "../state/store.js";
import { validDate } from "../pursuit/parser.js";
import { limits } from "../config/limits.js";

export async function existingStudyNote(
  root: string,
  date: string,
): Promise<string | null> {
  if (!validDate(date)) throw new Error("Invalid study note date");
  await ensureOutputDir(root, "study-notes");
  const path = insideRoot(root, `study-notes/${date}.md`);
  try {
    const metadata = await lstat(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size === 0 ||
      metadata.size > limits.maxFileBytes
    )
      throw new Error("Existing study note needs review; it was not replaced");
    return path;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Publish a complete note without replacing any file created by another run. */
export async function createStudyNote(
  root: string,
  date: string,
  content: string,
): Promise<boolean> {
  const existing = await existingStudyNote(root, date);
  if (existing) return false;
  if (!content.length || Buffer.byteLength(content) > limits.maxFileBytes)
    throw new Error("Study note exceeds size budget");
  const note = insideRoot(root, `study-notes/${date}.md`);
  const temporary = `${note}.${randomUUID()}.tmp`;
  const file = await open(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(content);
    await file.sync();
    await file.close();
    try {
      await link(temporary, note);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await existingStudyNote(root, date)))
        throw new Error("Study note disappeared during creation");
      return false;
    }
  } finally {
    await file.close();
    await unlink(temporary);
  }
}
