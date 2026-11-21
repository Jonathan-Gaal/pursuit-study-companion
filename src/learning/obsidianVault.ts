import { randomUUID } from "node:crypto";
import type { ExportFile } from "./obsidian.js";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

export async function validateObsidianVault(
  input: unknown,
): Promise<string | null> {
  if (typeof input !== "string" || input.length > 4096 || input.includes("\0"))
    return null;

  const folder = input.startsWith("~/")
    ? join(homedir(), input.slice(2))
    : input;
  if (!isAbsolute(folder)) return null;

  try {
    const path = await realpath(folder);
    const settings = join(path, ".obsidian");
    if (!(await stat(settings)).isDirectory()) return null;
    await access(path, constants.R_OK | constants.X_OK);
    await access(settings, constants.R_OK | constants.X_OK);
    return path;
  } catch {
    return null;
  }
}

export async function inspectObsidianDestination(vault: string) {
  const destination = join(vault, "Pursuit");
  for (const path of [destination, join(destination, "Daily")]) {
    try {
      if (!(await lstat(path)).isDirectory()) return null;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        return null;
    }
  }
  return destination;
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

async function matchesFile(path: string, content: Buffer) {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.size !== content.length) return false;
  const file = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size !== content.length) return false;
    const actual = Buffer.alloc(content.length + 1);
    const { bytesRead } = await file.read(actual, 0, actual.length, 0);
    return (
      bytesRead === content.length &&
      actual.subarray(0, bytesRead).equals(content)
    );
  } finally {
    await file.close();
  }
}

export async function syncObsidianNotes(vault: string, files: ExportFile[]) {
  const result = {
    created: 0,
    unchanged: 0,
    conflicts: [] as string[],
    failed: [] as string[],
    notes: [] as { path: string; uri: string }[],
  };
  const destination = join(vault, "Pursuit");
  const daily = join(destination, "Daily");
  for (const directory of [destination, daily]) {
    await mkdir(directory).catch((error: unknown) => {
      if (!hasCode(error, "EEXIST")) throw error;
    });
    if (!(await lstat(directory)).isDirectory())
      throw new Error("Unsafe vault destination.");
  }
  for (const file of files) {
    const name = /^Pursuit\/Daily\/(\d{4}-\d{2}-\d{2}\.md)$/.exec(
      file.path,
    )?.[1];
    if (!name) continue;
    const target = join(daily, name);
    const content = Buffer.from(file.content);
    const uri = `obsidian://open?path=${encodeURIComponent(target)}`;
    try {
      if ((await realpath(dirname(target))) !== daily)
        throw new Error("Vault destination changed.");
      try {
        if (await matchesFile(target, content)) {
          result.unchanged++;
          result.notes.push({ path: file.path, uri });
        } else result.conflicts.push(file.path);
        continue;
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }

      // Publish a complete note atomically without replacing an existing name.
      const staging = join(daily, `.pursuit-${randomUUID()}.tmp`);
      const staged = await open(staging, "wx", 0o600);
      try {
        try {
          await staged.writeFile(content);
        } finally {
          await staged.close();
        }
        await link(staging, target);
        result.created++;
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
        if (!(await matchesFile(target, content))) {
          result.conflicts.push(file.path);
          continue;
        }
        result.unchanged++;
      } finally {
        await unlink(staging);
      }
      result.notes.push({ path: file.path, uri });
    } catch {
      result.failed.push(file.path);
    }
  }
  return result;
}
