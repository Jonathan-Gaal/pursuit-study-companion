import { lstat, writeFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { configuredDayIds, daySelection } from "../config/daySelection.js";
import { githubRepository } from "../updates/service.js";

export function settingsStatus() {
  return {
    tokenConfigured:
      !!process.env.PURSUIT_TOKEN &&
      process.env.PURSUIT_TOKEN !== "your_token_here",
    cohort: process.env.PURSUIT_COHORT ?? "",
    dayIds: process.env.PURSUIT_DAY_IDS ?? "",
    timeZone: process.env.PURSUIT_TIME_ZONE ?? "America/New_York",
    upstream: process.env.STUDY_UPSTREAM_URL ?? "",
  };
}
export async function saveSettings(root: string, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid configuration");
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        !["token", "cohort", "dayIds", "timeZone", "upstream"].includes(key),
    )
  )
    throw new Error("Invalid configuration");
  const token = value.token === "" ? process.env.PURSUIT_TOKEN : value.token;
  if (
    typeof token !== "string" ||
    !token ||
    token === "your_token_here" ||
    token.length > 16000 ||
    /[\s\x00]/.test(token)
  )
    throw new Error("Invalid token");
  for (const key of ["cohort", "dayIds", "timeZone", "upstream"])
    if (
      typeof value[key] !== "string" ||
      (value[key] as string).length > 300 ||
      /[\r\n\x00]/.test(value[key] as string)
    )
      throw new Error("Invalid configuration");
  const cohort = (value.cohort as string).trim();
  const ids = (value.dayIds as string).trim();
  const timeZone = (value.timeZone as string).trim();
  const upstream = (value.upstream as string).trim();
  const parsed = configuredDayIds({ PURSUIT_DAY_IDS: ids });
  daySelection({ PURSUIT_DAY_ID: String(parsed[0]), PURSUIT_COHORT: cohort });
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  if (upstream) githubRepository(upstream);
  const env = resolve(root, ".env");
  try {
    const stat = await lstat(env);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Unsafe local configuration");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const values = {
    PURSUIT_TOKEN: token,
    PURSUIT_COHORT: cohort,
    PURSUIT_DAY_IDS: ids,
    PURSUIT_TIME_ZONE: timeZone,
    STUDY_UPSTREAM_URL: upstream,
    PURSUIT_DASHBOARD_PORT: process.env.PURSUIT_DASHBOARD_PORT ?? "4782",
  };
  const temp = resolve(root, ".env.setup.tmp");
  await writeFile(
    temp,
    Object.entries(values)
      .map(([key, item]) => `${key}=${JSON.stringify(item)}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  try {
    await rename(temp, env);
  } catch (error) {
    await unlink(temp);
    throw error;
  }
  Object.assign(process.env, values);
  return settingsStatus();
}
