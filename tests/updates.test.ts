import { expect, it, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { UpdateService, githubRepository } from "../src/updates/service.js";
const old = "a".repeat(40),
  next = "b".repeat(40);
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function root(
  repository:
    string | null = "https://github.com/example/pursuit-study-companion",
) {
  const folder = await mkdtemp(resolve(tmpdir(), "study-updates-"));
  roots.push(folder);
  await writeFile(
    resolve(folder, "updates.json"),
    JSON.stringify({ repository, branch: "main" }),
  );
  await writeFile(
    resolve(folder, "package.json"),
    JSON.stringify({ name: "pursuit-study-companion", version: "0.1.0" }),
  );
  return folder;
}
function runner({
  dirty = false,
  branch = "main",
  target = next,
  common = old,
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "symbolic-ref") return branch;
    if (args[0] === "status") return dirty ? " M source.ts" : "";
    if (args[0] === "rev-parse") return args[1] === "HEAD" ? old : target;
    if (args[0] === "show")
      return JSON.stringify({
        name: "pursuit-study-companion",
        version: target === old ? "0.1.0" : "0.1.1",
      });
    if (args[0] === "merge-base")
      return args[1] === target && args[2] === target ? target : common;
    if (args[0] === "fetch") return "";
    throw new Error("Unexpected command");
  });
}
it("checks canonical upstream rather than the student's origin without applying changes", async () => {
  const git = runner();
  const service = new UpdateService(await root(), git, async () => ({
    version: "0.1.1",
    tag: "v0.1.1",
  }));
  expect((await service.check()).state).toBe("AVAILABLE");
  expect(git.mock.calls.find(([args]) => args[0] === "fetch")?.[0]).toEqual([
    "fetch",
    "--no-tags",
    "--no-recurse-submodules",
    "--",
    "https://github.com/example/pursuit-study-companion",
    "refs/heads/main",
  ]);
  expect(
    git.mock.calls.every(
      ([args]) => !["merge", "reset", "stash", "pull"].includes(args[0]!),
    ),
  ).toBe(true);
});
it("blocks modified files, divergent histories and non-release branches", async () => {
  for (const options of [
    { dirty: true },
    { branch: "my-changes" },
    { common: "c".repeat(40) },
  ]) {
    const service = new UpdateService(
      await root(),
      runner(options),
      async () => ({ version: "0.1.1", tag: "v0.1.1" }),
    );
    expect((await service.check()).state).toBe("BLOCKED");
  }
});
it("requires fresh approval of the exact displayed commit", async () => {
  const service = new UpdateService(await root(), runner(), async () => ({
    version: "0.1.1",
    tag: "v0.1.1",
  }));
  await service.check();
  await expect(service.approve("c".repeat(40))).rejects.toThrow();
  expect((await service.approve(next)).target).toBe(next);
});
it("reports current and unconfigured states without a guessed remote", async () => {
  expect(
    (
      await new UpdateService(
        await root(),
        runner({ target: old }),
        async () => ({ version: "0.1.0", tag: "v0.1.0" }),
      ).check()
    ).state,
  ).toBe("CURRENT");
  const git = runner();
  expect(
    (
      await new UpdateService(await root(null), git, async () => ({
        version: "0.1.1",
        tag: "v0.1.1",
      })).check()
    ).state,
  ).toBe("UNCONFIGURED");
  expect(git).not.toHaveBeenCalled();
});
it("does not expose transport errors or accept credential-bearing/non-GitHub URLs", async () => {
  const service = new UpdateService(
    await root(),
    vi.fn().mockRejectedValue(new Error("secret transport error")),
  );
  expect(JSON.stringify(await service.check())).not.toContain(
    "secret transport error",
  );
  for (const value of [
    "https://user:token@github.com/a/b",
    "ssh://github.com/a/b",
    "https://github.com/a/b?token=secret",
    "https://evil.com/a/b",
    "--upload-pack=bad",
  ])
    expect(() => githubRepository(value)).toThrow();
});

it("clears a previously available update when its local source is disconnected", async () => {
  vi.stubEnv("STUDY_UPSTREAM_URL", "https://github.com/example/study");
  const service = new UpdateService(await root(null), runner(), async () => ({
    version: "0.1.1",
    tag: "v0.1.1",
  }));
  expect((await service.check()).state).toBe("AVAILABLE");
  vi.stubEnv("STUDY_UPSTREAM_URL", "");
  expect((await service.check()).state).toBe("UNCONFIGURED");
  await expect(service.approve(next)).rejects.toThrow();
});

it("offers published stable versions only and rejects tag/package mismatches", async () => {
  const folder = await root();
  const lookup = vi.fn(async () => null);
  const git = runner();
  expect((await new UpdateService(folder, git, lookup).check()).state).toBe(
    "CURRENT",
  );
  expect(git.mock.calls.some(([args]) => args[0] === "fetch")).toBe(false);
  const mismatch = runner();
  mismatch.mockImplementation(async (args) =>
    args[0] === "show"
      ? JSON.stringify({ name: "pursuit-study-companion", version: "8.0.0" })
      : await git(args),
  );
  expect(
    (
      await new UpdateService(folder, mismatch, async () => ({
        version: "0.1.1",
        tag: "v0.1.1",
      })).check()
    ).state,
  ).toBe("ERROR");
});
it("does not downgrade or accept republished versions with changed commits", async () => {
  const folder = await root();
  expect(
    (
      await new UpdateService(folder, runner(), async () => ({
        version: "0.0.9",
        tag: "v0.0.9",
      })).check()
    ).state,
  ).toBe("CURRENT");
  expect(
    (
      await new UpdateService(folder, runner(), async () => ({
        version: "0.1.0",
        tag: "v0.1.0",
      })).check()
    ).state,
  ).toBe("ERROR");
});
