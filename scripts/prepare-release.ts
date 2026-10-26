import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { nextVersion } from "../src/updates/version.js";
const git = promisify(execFile);
const root = process.cwd();
try {
  const bump = process.argv[2];
  if (!bump || process.argv.length !== 3)
    throw new Error("Use npm run release:prepare -- patch|minor|major|X.Y.Z");
  if (
    (
      await git("git", ["status", "--porcelain", "--untracked-files=all"], {
        cwd: root,
      })
    ).stdout.trim()
  )
    throw new Error("Commit source changes before preparing a release.");
  const config = JSON.parse(
    await readFile(resolve(root, "updates.json"), "utf8"),
  );
  if (
    (
      await git("git", ["branch", "--show-current"], { cwd: root })
    ).stdout.trim() !== config.branch
  )
    throw new Error("Prepare releases on the configured release branch.");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(
    await readFile(resolve(root, "package-lock.json"), "utf8"),
  );
  if (
    pkg.version !== lock.version ||
    pkg.version !== lock.packages?.[""]?.version
  )
    throw new Error("Version files disagree.");
  const version = nextVersion(pkg.version, bump);
  const changelogPath = resolve(root, "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  if (!changelog.startsWith("# Changelog\n"))
    throw new Error("Invalid changelog.");
  pkg.version = lock.version = lock.packages[""].version = version;
  await writeFile(
    resolve(root, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  await writeFile(
    resolve(root, "package-lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
  );
  await writeFile(
    changelogPath,
    changelog.replace(
      "# Changelog\n",
      `# Changelog\n\n## ${version} — ${new Date().toISOString().slice(0, 10)}\n\n- Describe the changes in this release before tagging.\n`,
    ),
  );
  console.log(
    `Prepared ${version}. Edit CHANGELOG.md, review the changes, then commit. Run npm run release:tag after checks pass. Nothing was committed or published.`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Could not prepare release.",
  );
  process.exitCode = 1;
}
