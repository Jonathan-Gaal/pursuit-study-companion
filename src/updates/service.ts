import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const execute = promisify(execFile);
export type UpdateState = {
  state: "UNCONFIGURED" | "CURRENT" | "AVAILABLE" | "BLOCKED" | "ERROR";
  message: string;
  current?: string;
  target?: string;
  checkedAt?: string;
};
export type GitRun = (args: string[]) => Promise<string>;
export function githubRepository(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*(?:\.git)?$/.test(
      value,
    )
  )
    throw new Error("Use an HTTPS GitHub repository URL without credentials.");
  return value;
}
const hash = (value: string) => {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error("Invalid commit");
  return value;
};
export class UpdateService {
  status: UpdateState = {
    state: "UNCONFIGURED",
    message:
      "The publisher has not configured the upstream GitHub repository yet.",
  };
  private checking = false;
  private repository?: string;
  private branch = "main";
  private readonly git: GitRun;
  constructor(
    readonly root: string,
    git?: GitRun,
  ) {
    this.git =
      git ??
      (async (args) =>
        (
          await execute(
            "git",
            [
              "-c",
              "core.hooksPath=" + resolve(root, ".runtime/disabled-hooks"),
              "-c",
              "credential.helper=",
              "-c",
              "protocol.allow=never",
              "-c",
              "protocol.https.allow=always",
              ...args,
            ],
            {
              cwd: root,
              timeout: 30000,
              maxBuffer: 1024 * 1024,
              env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            },
          )
        ).stdout.trim());
  }
  async check(): Promise<UpdateState> {
    if (this.checking) return this.status;
    this.checking = true;
    try {
      const config = JSON.parse(
        await readFile(resolve(this.root, "updates.json"), "utf8"),
      ) as { repository?: unknown; branch?: unknown };
      const repository =
        process.env.STUDY_UPSTREAM_URL?.trim() || config.repository;
      if (!repository) return this.status;
      this.repository = githubRepository(repository);
      this.branch =
        typeof config.branch === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9_/-]{0,100}$/.test(config.branch) &&
        !config.branch.includes("..")
          ? config.branch
          : "main";
      // A fork's origin is deliberately never used as the release source.
      const branch = await this.git(["symbolic-ref", "--short", "HEAD"]);
      const current = hash(await this.git(["rev-parse", "HEAD"]));
      if (
        branch !== this.branch ||
        (await this.git(["status", "--porcelain", "--untracked-files=all"]))
      )
        return (this.status = {
          state: "BLOCKED",
          message:
            "Use the release branch with no local source changes before updating.",
          current,
        });
      await this.git([
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        "--",
        this.repository,
        `refs/heads/${this.branch}`,
      ]);
      const target = hash(await this.git(["rev-parse", "FETCH_HEAD"]));
      const common = await this.git(["merge-base", current, target]);
      if (common !== current)
        return (this.status = {
          state: "BLOCKED",
          message:
            "Your source history differs from upstream. Resolve your Git changes manually; no files were replaced.",
          current,
          target,
        });
      return (this.status = {
        state: current === target ? "CURRENT" : "AVAILABLE",
        current,
        target,
        checkedAt: new Date().toISOString(),
        message:
          current === target
            ? "You have the current upstream version."
            : "An upstream update is available.",
      });
    } catch {
      return (this.status = {
        state: "ERROR",
        message:
          "Could not check GitHub. Check Git, network access and the repository configuration. Your installed app is unchanged.",
      });
    } finally {
      this.checking = false;
    }
  }
  async approve(target: string) {
    const checked = await this.check();
    if (
      checked.state !== "AVAILABLE" ||
      checked.target !== target ||
      !this.repository ||
      !checked.current
    )
      throw new Error(
        "The update changed or local source needs review. Check again.",
      );
    return {
      target: hash(target),
      current: hash(checked.current),
      repository: this.repository,
      branch: this.branch,
    };
  }
}
