import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const execute = promisify(execFile);

it.skipIf(process.platform === "win32")(
  "journals a failed install after a real fast-forward while preserving student data, without retry or raw errors",
  async () => {
    const folder = await mkdtemp(resolve(tmpdir(), "study-update-worker-"));
    try {
      const release = resolve(folder, "release"),
        student = resolve(folder, "student"),
        bin = resolve(folder, "bin");
      await mkdir(release);
      await mkdir(bin);
      const actualGit = (await execute("which", ["git"])).stdout.trim();
      const git = async (args: string[], cwd = release) =>
        (await execute(actualGit, args, { cwd })).stdout.trim();
      await git(["init", "-b", "main"]);
      await writeFile(
        resolve(release, ".gitignore"),
        ".env\nstate/\nstudy-notes/\n.runtime/\n",
      );
      await writeFile(resolve(release, "version.txt"), "first release");
      await writeFile(
        resolve(release, "package.json"),
        JSON.stringify({ name: "pursuit-study-companion", version: "0.1.0" }),
      );
      await git(["add", "."]);
      const commit = () =>
        git([
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-m",
          "Offline fixture release",
        ]);
      await commit();
      const old = await git(["rev-parse", "HEAD"]);
      await git(["clone", release, student], folder);
      await writeFile(resolve(release, "version.txt"), "second release");
      await writeFile(
        resolve(release, "package.json"),
        JSON.stringify({ name: "pursuit-study-companion", version: "0.1.1" }),
      );
      await git(["add", "."]);
      await commit();
      const target = await git(["rev-parse", "HEAD"]);
      await git(["tag", "v0.1.1"]);
      await mkdir(resolve(student, "study-notes"));
      await mkdir(resolve(student, ".runtime"));
      await writeFile(
        resolve(student, ".env"),
        "PURSUIT_TOKEN=synthetic-personal-token",
      );
      await writeFile(
        resolve(student, "study-notes/personal.md"),
        "Student annotations",
      );
      await writeFile(resolve(student, ".runtime/study-run.lock"), "fixture");
      await writeFile(resolve(student, ".runtime/update.lock"), "fixture");
      // Map the fixed fake GitHub URL to an offline local release repo.
      const wrapper = `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');let args=process.argv.slice(2).map(value=>value==='https://github.com/example/study'?${JSON.stringify(release)}:value);const result=spawnSync(${JSON.stringify(actualGit)},['-c','protocol.file.allow=always',...args],{stdio:'inherit'});process.exit(result.status??1);\n`;
      await writeFile(resolve(bin, "git"), wrapper);
      await chmod(resolve(bin, "git"), 0o755);
      const npmCli = resolve(folder, "npm-cli.js");
      const calls = resolve(folder, "npm-calls.txt");
      await writeFile(
        npmCli,
        `require('node:fs').appendFileSync(${JSON.stringify(calls)},'attempt\\n'); throw new Error('private-transport-error');`,
      );
      const worker = new URL("../scripts/update-worker.mjs", import.meta.url);
      await expect(
        execute(
          process.execPath,
          [
            worker.pathname,
            "1000000000",
            old,
            target,
            "https://github.com/example/study",
            "main",
            npmCli,
            "v0.1.1",
            "0.1.1",
          ],
          {
            cwd: student,
            timeout: 10000,
            env: { ...process.env, PATH: bin + ":" + process.env.PATH },
          },
        ),
      ).rejects.toThrow();
      expect(await git(["rev-parse", "HEAD"], student)).toBe(target);
      expect(
        await readFile(resolve(student, "study-notes/personal.md"), "utf8"),
      ).toBe("Student annotations");
      expect(await readFile(resolve(student, ".env"), "utf8")).toBe(
        "PURSUIT_TOKEN=synthetic-personal-token",
      );
      const journal = await readFile(
        resolve(student, ".runtime/update-state.json"),
        "utf8",
      );
      expect(JSON.parse(journal).state).toBe("ERROR");
      expect(journal).not.toContain("private-transport-error");
      expect(await readFile(calls, "utf8")).toBe("attempt\n");
      await expect(
        readFile(resolve(student, ".runtime/study-run.lock")),
      ).rejects.toThrow();
      await expect(
        readFile(resolve(student, ".runtime/update.lock")),
      ).rejects.toThrow();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
  15000,
);
