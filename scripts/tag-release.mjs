import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkRelease } from "./check-release.mjs";
const execute = promisify(execFile);
try {
  const release = await checkRelease();
  const git = async (...args) => (await execute("git", args)).stdout.trim();
  if (await git("status", "--porcelain", "--untracked-files=all"))
    throw new Error("Commit all release changes before tagging.");
  if ((await git("branch", "--show-current")) !== release.branch)
    throw new Error("Use the release branch.");
  if (await git("tag", "--list", release.tag))
    throw new Error("Release tag already exists. Never move a published tag.");
  const previous = (await git("tag", "--list", "v*"))
    .split("\n")
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  const compare = (a, b) => {
    const x = a.slice(1).split(".").map(Number),
      y = b.slice(1).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] - y[i];
    }
    return 0;
  };
  if (previous.some((tag) => compare(tag, release.tag) >= 0))
    throw new Error("Release versions must increase.");
  await git(
    "tag",
    "-a",
    release.tag,
    "-m",
    `Pursuit Study Companion ${release.tag}`,
  );
  console.log(
    `Created local tag ${release.tag}. Nothing was pushed. Publish with: git push origin ${release.branch} ${release.tag}`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
