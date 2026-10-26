import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DashboardAuth } from "../src/dashboard/auth.js";
import type { HistoryStore } from "../src/history/store.js";
import { PursuitReadError } from "../src/pursuit/errors.js";
import { saveLocalToken } from "../src/pursuit/tokenStore.js";
import { tokenExpiry } from "../src/pursuit/tokenStatus.js";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function fakeToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  return `testheader.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.testsignature`;
}
async function workspace() {
  const root = await mkdtemp(resolve(tmpdir(), "pursuit-auth-"));
  roots.push(root);
  return root;
}
function service(root: string, verify = vi.fn(async (_token: string) => {})) {
  return {
    auth: new DashboardAuth(root, {} as HistoryStore, verify, async () => {}),
    verify,
  };
}
it("reports missing and expired tokens without requests; never returns credentials", async () => {
  const { auth, verify } = service("/unused");
  vi.stubEnv("PURSUIT_TOKEN", "");
  expect((await auth.status()).state).toBe("MISSING");
  const token = fakeToken(1);
  vi.stubEnv("PURSUIT_TOKEN", token);
  const status = await auth.status();
  expect(status.state).toBe("EXPIRED");
  expect(JSON.stringify(status)).not.toContain(token);
  expect(verify).not.toHaveBeenCalled();
});
it("requires server verification, caches checks and allows explicit rechecking", async () => {
  const { auth, verify } = service("/unused");
  vi.stubEnv("PURSUIT_TOKEN", fakeToken());
  expect((await auth.status()).state).toBe("VERIFIED");
  await auth.status();
  expect(verify).toHaveBeenCalledTimes(1);
  verify.mockRejectedValue(new PursuitReadError("AUTH"));
  expect((await auth.status(true)).state).toBe("REJECTED");
  verify.mockRejectedValue(new Error("raw transport secret"));
  const result = await auth.status(true);
  expect(result.state).toBe("UNKNOWN");
  expect(JSON.stringify(result)).not.toContain("raw transport secret");
});
it("verifies captured credentials before saving, preserves configuration, uses private file permissions", async () => {
  const root = await workspace();
  await writeFile(
    resolve(root, ".env"),
    "# local\nOTHER=keep\nPURSUIT_TOKEN=old\n",
  );
  const { auth, verify } = service(root);
  vi.stubEnv("PURSUIT_TOKEN", "old");
  const token = fakeToken();
  expect((await auth.accept(token)).state).toBe("VERIFIED");
  expect(verify).toHaveBeenCalledWith(token);
  expect(await readFile(resolve(root, ".env"), "utf8")).toBe(
    `# local\nOTHER=keep\nPURSUIT_TOKEN=${token}\n`,
  );
  expect((await stat(resolve(root, ".env"))).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(await auth.status())).not.toContain(token);
});
it("does not persist rejected, expired or malformed captures", async () => {
  const root = await workspace();
  const { auth, verify } = service(root);
  vi.stubEnv("PURSUIT_TOKEN", "old");
  verify.mockRejectedValue(new PursuitReadError("AUTH"));
  for (const token of [fakeToken(), fakeToken(1), "bad\nvalue"])
    await expect(auth.accept(token)).rejects.toThrow();
  await expect(stat(resolve(root, ".env"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(process.env.PURSUIT_TOKEN).toBe("old");
});
it("refuses symlinked configuration and ignores invalid expiry claims", async () => {
  const root = await workspace();
  const other = resolve(root, "other");
  await writeFile(other, "keep");
  await symlink(other, resolve(root, ".env"));
  await expect(saveLocalToken(root, fakeToken())).rejects.toThrow();
  expect(await readFile(other, "utf8")).toBe("keep");
  expect(tokenExpiry(fakeToken(1e300))).toBeNull();
  expect(tokenExpiry("broken")).toBeNull();
});

it("keeps local dashboard readiness responsive while remote verification is pending", async () => {
  let finish!: () => void;
  const verify = vi.fn(
    (_token: string) =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const auth = new DashboardAuth(
    "/unused",
    {} as HistoryStore,
    verify,
    async () => {},
  );
  vi.stubEnv("PURSUIT_TOKEN", fakeToken());
  expect((await auth.poll()).state).toBe("UNKNOWN");
  await Promise.resolve();
  finish();
  expect((await auth.status()).state).toBe("VERIFIED");
});
