import { access, lstat, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

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
