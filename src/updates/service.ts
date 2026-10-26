import { stableVersion, compareVersions } from "./version.js";
import { latestRelease, type ReleaseLookup } from "./releases.js";
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
  installedVersion?: string;
  availableVersion?: string;
  releaseTag?: string;
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
  private nextAutomaticCheck = 0;
  private static readonly automaticIntervalMs = 30 * 60 * 1000;
  private repository?: string;
  private branch = "main";
  private readonly git: GitRun;
  constructor(
    readonly root: string,
    git?: GitRun,
    private readonly release: ReleaseLookup = latestRelease,
    private readonly now: () => number = Date.now,
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
  /** A dashboard refresh never waits for GitHub and never applies an update. */
  poll(): UpdateState {
    if (!this.checking && this.now() >= this.nextAutomaticCheck)
      void this.check();
    return this.status;
  }
  async check(): Promise<UpdateState> {
    if (this.checking) return this.status;
    this.checking = true;
    this.nextAutomaticCheck = this.now() + UpdateService.automaticIntervalMs;
    let installedVersion: string | undefined;
    let availableVersion: string | undefined;
    try {
      installedVersion = stableVersion(
        JSON.parse(await readFile(resolve(this.root, "package.json"), "utf8"))
          .version,
      );
      const config = JSON.parse(
        await readFile(resolve(this.root, "updates.json"), "utf8"),
      ) as { repository?: unknown; branch?: unknown };
      const repository =
        process.env.STUDY_UPSTREAM_URL?.trim() || config.repository;
      if (!repository) {
        this.repository = undefined;
        return (this.status = {
          installedVersion,
          state: "UNCONFIGURED",
          message:
            "The publisher has not configured the upstream GitHub repository yet.",
        });
      }
      this.repository = githubRepository(repository);
      this.branch =
        typeof config.branch === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9_/-]{0,100}$/.test(config.branch) &&
        !config.branch.includes("..")
          ? config.branch
          : "main";
      const release = await this.release(this.repository);
      if (release) {
        availableVersion = stableVersion(release.version);
        if (release.tag !== `v${availableVersion}`)
          throw new Error("Release tag mismatch");
      }
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
            availableVersion &&
            compareVersions(availableVersion, installedVersion) > 0
              ? `Version ${availableVersion} is available. Local source changes or a different branch must be resolved before updating.`
              : "Use the release branch with no local source changes before updating.",
          current,
          installedVersion,
          availableVersion,
          checkedAt: new Date(this.now()).toISOString(),
        });
      if (!release)
        return (this.status = {
          state: "CURRENT",
          installedVersion,
          current,
          checkedAt: new Date(this.now()).toISOString(),
          message: "No published stable release is available yet.",
        });
      const versionOrder = compareVersions(release.version, installedVersion);
      if (versionOrder < 0)
        return (this.status = {
          state: "CURRENT",
          installedVersion,
          current,
          availableVersion,
          checkedAt: new Date(this.now()).toISOString(),
          message:
            "Your installed version is newer than the published stable release.",
        });
      await this.git([
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        "--",
        this.repository,
        `refs/heads/${this.branch}`,
      ]);
      const branchHead = hash(await this.git(["rev-parse", "FETCH_HEAD"]));
      await this.git([
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        "--",
        this.repository,
        `refs/tags/${release.tag}`,
      ]);
      const target = hash(await this.git(["rev-parse", "FETCH_HEAD^{commit}"]));
      if ((await this.git(["merge-base", target, branchHead])) !== target)
        throw new Error("Release outside canonical branch");
      const remotePackage = JSON.parse(
        await this.git(["show", `${target}:package.json`]),
      );
      if (
        remotePackage.name !== "pursuit-study-companion" ||
        remotePackage.version !== release.version
      )
        throw new Error("Release/package mismatch");
      if (
        (versionOrder === 0 && target !== current) ||
        (versionOrder > 0 && target === current)
      )
        throw new Error("Version/commit mismatch");
      const common = await this.git(["merge-base", current, target]);
      if (common !== current)
        return (this.status = {
          state: "BLOCKED",
          message:
            "Your source history differs from upstream. Resolve your Git changes manually; no files were replaced.",
          current,
          target,
          installedVersion,
          availableVersion,
          checkedAt: new Date(this.now()).toISOString(),
        });
      return (this.status = {
        state: current === target ? "CURRENT" : "AVAILABLE",
        current,
        target,
        installedVersion,
        availableVersion: release.version,
        releaseTag: release.tag,
        checkedAt: new Date(this.now()).toISOString(),
        message:
          current === target
            ? `Version ${installedVersion} is up to date.`
            : `Version ${release.version} is available.`,
      });
    } catch {
      return (this.status = {
        installedVersion,
        availableVersion,
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
      releaseTag: checked.releaseTag!,
      version: checked.availableVersion!,
    };
  }
}
