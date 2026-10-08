import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { projectRoot } from "./index.js";
import { limits } from "./limits.js";
import { PursuitReadError } from "../pursuit/errors.js";
/** Load only the project's ignored .env; never print its contents. Existing shell variables take precedence. */
export async function loadLocalEnvironment(): Promise<void> {
  const path = resolve(projectRoot, ".env");
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > limits.maxFileBytes
    )
      throw new PursuitReadError("CONFIG");
    loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new PursuitReadError("CONFIG");
  }
}
