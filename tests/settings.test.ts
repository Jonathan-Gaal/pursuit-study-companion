import { expect, it, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { saveSettings } from "../src/dashboard/settings.js";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function root() {
  const path = await mkdtemp(resolve(tmpdir(), "study-settings-"));
  roots.push(path);
  return path;
}
const settings = {
  token: "synthetic-only-token",
  cohort: "L2 - September 2026",
  dayIds: "1648",
  timeZone: "America/New_York",
  upstream: "",
};
it("stores the token locally and never returns it to the UI", async () => {
  const folder = await root();
  for (const key of [
    "PURSUIT_TOKEN",
    "PURSUIT_COHORT",
    "PURSUIT_DAY_IDS",
    "PURSUIT_TIME_ZONE",
    "STUDY_UPSTREAM_URL",
    "PURSUIT_DASHBOARD_PORT",
  ])
    vi.stubEnv(key, "");
  const result = await saveSettings(folder, settings);
  expect(result.tokenConfigured).toBe(true);
  expect(JSON.stringify(result)).not.toContain(settings.token);
  expect(await readFile(resolve(folder, ".env"), "utf8")).toContain(
    settings.token,
  );
});
it("rejects secret injection, unknown options, invalid IDs and timezone", async () => {
  const folder = await root();
  for (const value of [
    { ...settings, token: "bad\nTOKEN=leak" },
    { ...settings, dayIds: "unknown" },
    { ...settings, timeZone: "bad" },
    { ...settings, enableSubmissions: true },
  ])
    await expect(saveSettings(folder, value)).rejects.toThrow();
});
it.skipIf(process.platform === "win32")(
  "does not follow an existing configuration symlink",
  async () => {
    const folder = await root();
    await symlink(resolve(folder, "elsewhere"), resolve(folder, ".env"));
    await expect(saveSettings(folder, settings)).rejects.toThrow();
  },
);
