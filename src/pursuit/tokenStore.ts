import { constants } from "node:fs";
import { open, lstat, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { limits } from "../config/limits.js";
import { validTokenInput } from "./tokenStatus.js";

/** Keep other local configuration unchanged; never return or log the token. */
export async function saveLocalToken(root: string, token: string) {
  if (!validTokenInput(token)) throw new Error("Invalid token format.");
  const path = resolve(root, ".env");
  let original = "";
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > limits.maxFileBytes)
        throw new Error("Unsafe configuration.");
      original = await file.readFile("utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Cannot read local configuration.");
  }
  const pattern = /^[ \t]*(?:export[ \t]+)?PURSUIT_TOKEN[ \t]*=.*$/gm;
  const updated = pattern.test(original)
    ? original.replace(pattern, () => `PURSUIT_TOKEN=${token}`)
    : original +
      (original && !original.endsWith("\n") ? "\n" : "") +
      `PURSUIT_TOKEN=${token}\n`;
  const temporary = resolve(root, `.env.${randomUUID()}.tmp`);
  const file = await open(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(updated);
    await file.sync();
    await file.close();
    try {
      if ((await lstat(path)).isSymbolicLink())
        throw new Error("Unsafe configuration.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, path);
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
