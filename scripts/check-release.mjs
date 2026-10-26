import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
export async function checkRelease(
  root = process.cwd(),
  tag = process.env.RELEASE_TAG,
) {
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(
    await readFile(resolve(root, "package-lock.json"), "utf8"),
  );
  if (
    pkg.name !== "pursuit-study-companion" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)
  )
    throw new Error("Invalid package/version.");
  if (
    pkg.version !== lock.version ||
    pkg.version !== lock.packages?.[""]?.version
  )
    throw new Error("Package and lockfile versions must match.");
  if (tag && tag !== `v${pkg.version}`)
    throw new Error("Tag does not match package version.");
  const config = JSON.parse(
    await readFile(resolve(root, "updates.json"), "utf8"),
  );
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(
      config.repository ?? "",
    ) ||
    config.branch !== "main"
  )
    throw new Error(
      "Configure the canonical GitHub repository and main release branch.",
    );
  if (
    process.env.GITHUB_REPOSITORY &&
    config.repository !== `https://github.com/${process.env.GITHUB_REPOSITORY}`
  )
    throw new Error("Only the canonical repository may publish this release.");
  const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
  const section = changelog.split(`## ${pkg.version} — `)[1]?.split(/^## /m)[0];
  if (
    !section ||
    section.includes("Describe the changes in this release before tagging")
  )
    throw new Error("Complete the release changelog.");
  const files = (await execute("git", ["ls-files", "-z"], { cwd: root })).stdout
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    if (
      (/^(?:\.env(?:$|\.)|state\/|study-notes\/|\.runtime\/|submissions\/|.*\.app\/)/.test(
        file,
      ) &&
        file !== ".env.example") ||
      /\.(?:db|sqlite)(?:-|$)/.test(file)
    )
      throw new Error(
        "Tracked personal/runtime data is not allowed in releases.",
      );
    const contents = await readFile(resolve(root, file));
    if (
      contents.includes(Buffer.from("-----BEGIN " + "PRIVATE KEY-----")) ||
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{30,}|gsk_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(
        contents.toString("utf8"),
      )
    )
      throw new Error(
        "Possible credential in release source; review before publishing.",
      );
  }
  return {
    version: pkg.version,
    tag: `v${pkg.version}`,
    repository: config.repository,
    branch: config.branch,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const release = await checkRelease();
    console.log(
      `Release ${release.tag} is consistent. Local student data is excluded.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
