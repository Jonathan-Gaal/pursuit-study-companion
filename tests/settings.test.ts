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

it("preserves study AI settings without returning secrets or enabling automation", async () => {
  const folder = await root();
  vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-key");
  vi.stubEnv("GEMINI_FREE_TIER_CONFIRMED", "true");
  vi.stubEnv("GROQ_API_KEY", "synthetic-groq-key");
  vi.stubEnv("GROQ_FREE_TIER_CONFIRMED", "true");
  vi.stubEnv("PURSUIT_ENABLE_SUBMISSIONS", "true");
  const result = await saveSettings(folder, settings);
  const file = await readFile(resolve(folder, ".env"), "utf8");
  expect(file).toContain("synthetic-gemini-key");
  expect(file).toContain("synthetic-groq-key");
  expect(file).not.toContain("ENABLE_SUBMISSIONS");
  expect(JSON.stringify(result)).not.toContain("synthetic-");
});

it("allows cohort setup before native sign-in without a token", async () => {
  vi.stubEnv("PURSUIT_TOKEN", "");
  const folder = await root();
  expect(
    (await saveSettings(folder, { ...settings, token: "" })).tokenConfigured,
  ).toBe(false);
});
