import { PursuitReadError } from "../pursuit/errors.js";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute } from "node:path";
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export interface RunConfig {
  dryRun: true;
  dayId?: number;
  mode?: "fixture" | "live";
  fixturePath: string;
  root: string;
}
export function parseArgs(args: string[]): RunConfig {
  let dayId: number | undefined;
  let mode: "fixture" | "live" = "live";
  let fixturePath = resolve(projectRoot, "fixtures/presentation-day.json");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") continue;
    if (arg === "--fixture") {
      mode = "fixture";
      continue;
    }
    if (arg === "--day") {
      const value = args[++i];
      if (
        !value ||
        !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        dayId !== undefined
      )
        throw new PursuitReadError("BLOCKED");
      dayId = Number(value);
      continue;
    }
    if (arg === "--fixture-path") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error("--fixture-path requires a path");
      mode = "fixture";
      fixturePath = resolve(projectRoot, value);
      continue;
    }
    throw new PursuitReadError("BLOCKED");
  }
  if (mode === "fixture" && dayId !== undefined)
    throw new PursuitReadError("BLOCKED");
  return {
    dryRun: true,
    mode,
    fixturePath,
    root: projectRoot,
    ...(dayId !== undefined ? { dayId } : {}),
  };
}
export function insideRoot(root: string, path: string): string {
  const result = resolve(root, path);
  const rel = relative(root, result);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Output path must stay inside project");
  return result;
}
