import { expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const execute = promisify(execFile);
const script = (name: string) =>
  fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
it("prepares matching versions, requires completed notes and a clean tree, and tags without publishing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "study-release-"));
  try {
    const git = async (...args: string[]) =>
      (await execute("git", args, { cwd: root })).stdout.trim();
    await git("init", "-b", "main");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.invalid");
    await writeFile(
      resolve(root, "package.json"),
      JSON.stringify({ name: "pursuit-study-companion", version: "0.1.0" }),
    );
    await writeFile(
      resolve(root, "package-lock.json"),
      JSON.stringify({
        version: "0.1.0",
        packages: { "": { version: "0.1.0" } },
      }),
    );
    await writeFile(
      resolve(root, "updates.json"),
      JSON.stringify({
        repository: "https://github.com/example/study",
        branch: "main",
      }),
    );
    await writeFile(
      resolve(root, "CHANGELOG.md"),
      "# Changelog\n\n## 0.1.0 — 2026-01-01\n\n- First release.\n",
    );
    await git("add", ".");
    await git("commit", "-m", "Fixture");
    const env = { ...process.env };
    delete env.GITHUB_REPOSITORY;
    delete env.RELEASE_TAG;
    const check = () =>
      execute(process.execPath, [script("check-release.mjs")], {
        cwd: root,
        env,
      });
    expect((await check()).stdout).toContain("v0.1.0");
    const loader = pathToFileURL(
      createRequire(import.meta.url).resolve("tsx"),
    ).href;
    await execute(
      process.execPath,
      ["--import", loader, script("prepare-release.ts"), "patch"],
      { cwd: root, env },
    );
    const pkg = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    );
    const lock = JSON.parse(
      await readFile(resolve(root, "package-lock.json"), "utf8"),
    );
    expect(pkg.version).toBe("0.1.1");
    expect(lock.packages[""].version).toBe(pkg.version);
    await expect(check()).rejects.toThrow();
    const notes = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
    await writeFile(
      resolve(root, "CHANGELOG.md"),
      notes.replace(
        "Describe the changes in this release before tagging.",
        "Fixed study navigation.",
      ),
    );
    await expect(
      execute(process.execPath, [script("tag-release.mjs")], {
        cwd: root,
        env,
      }),
    ).rejects.toThrow();
    await git("add", ".");
    await git("commit", "-m", "Prepare version");
    await execute(process.execPath, [script("tag-release.mjs")], {
      cwd: root,
      env,
    });
    expect(await git("tag", "--list")).toBe("v0.1.1");
    expect(await git("remote")).toBe("");
    await expect(
      execute(process.execPath, [script("tag-release.mjs")], {
        cwd: root,
        env,
      }),
    ).rejects.toThrow();
    await writeFile(resolve(root, ".env"), "LOCAL=synthetic-only");
    await git("add", ".env");
    await expect(check()).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
