import { constants } from "node:fs";
import { lstat, open, rename } from "node:fs/promises";
import { limits } from "../config/limits.js";
import { insideRoot } from "../config/index.js";
import { readBoundedJson } from "./boundedFile.js";
import { ensureOutputDir } from "../state/store.js";

export interface DiscoveredDay {
  dayId: number;
  date: string;
}

const cacheRelativePath = ".runtime/day-discovery.json";

export async function loadDiscoveredDays(
  root: string,
  today: string,
): Promise<DiscoveredDay[]> {
  try {
    await ensureOutputDir(root, ".runtime");
    const raw = await readBoundedJson(insideRoot(root, cacheRelativePath));
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      (raw as { version?: unknown }).version !== 1 ||
      !Array.isArray((raw as { days?: unknown }).days) ||
      (raw as { days: unknown[] }).days.length > limits.maxDays
    )
      throw new Error("Invalid local day-discovery cache.");
    const days = (raw as { days: unknown[] }).days.map((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        !Number.isSafeInteger((value as DiscoveredDay).dayId) ||
        (value as DiscoveredDay).dayId <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test((value as DiscoveredDay).date)
      )
        throw new Error("Invalid local day-discovery cache.");
      return value as DiscoveredDay;
    });
    if (new Set(days.map((day) => day.dayId)).size !== days.length)
      throw new Error("Invalid local day-discovery cache.");
    return days.filter((day) => day.date >= today);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(
      "Local day-discovery cache is invalid; inspect it before rerunning.",
    );
  }
}

export async function saveDiscoveredDays(
  root: string,
  days: DiscoveredDay[],
  today: string,
): Promise<void> {
  const active = [
    ...new Map(
      days
        .filter((day) => day.date >= today)
        .sort((a, b) => a.dayId - b.dayId)
        .map((day) => [day.dayId, day]),
    ).values(),
  ].slice(-limits.maxDays);
  await ensureOutputDir(root, ".runtime");
  const path = insideRoot(root, cacheRelativePath);
  const temporary = insideRoot(root, `${cacheRelativePath}.tmp`);
  try {
    await lstat(temporary);
    throw new Error(
      "Day-discovery temporary file exists; inspect before rerunning.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const json = JSON.stringify({ version: 1, days: active }, null, 2) + "\n";
  if (Buffer.byteLength(json) > limits.maxFileBytes)
    throw new Error("Day-discovery cache exceeded its size limit.");
  const handle = await open(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(json);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}
