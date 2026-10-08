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
    if (args[0] === "merge-base") return common;
    if (args[0] === "fetch") return "";
    throw new Error("Unexpected command");
  });
}
it("checks canonical upstream rather than the student's origin without applying changes", async () => {
  const git = runner();
  const service = new UpdateService(await root(), git);
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
    const service = new UpdateService(await root(), runner(options));
    expect((await service.check()).state).toBe("BLOCKED");
  }
});
it("requires fresh approval of the exact displayed commit", async () => {
  const service = new UpdateService(await root(), runner());
  await service.check();
  await expect(service.approve("c".repeat(40))).rejects.toThrow();
  expect((await service.approve(next)).target).toBe(next);
});
it("reports current and unconfigured states without a guessed remote", async () => {
  expect(
    (await new UpdateService(await root(), runner({ target: old })).check())
      .state,
  ).toBe("CURRENT");
  const git = runner();
  expect((await new UpdateService(await root(null), git).check()).state).toBe(
    "UNCONFIGURED",
  );
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
  const service = new UpdateService(await root(null), runner());
  expect((await service.check()).state).toBe("AVAILABLE");
  vi.stubEnv("STUDY_UPSTREAM_URL", "");
  expect((await service.check()).state).toBe("UNCONFIGURED");
  await expect(service.approve(next)).rejects.toThrow();
});
