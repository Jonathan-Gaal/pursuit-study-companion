// Copied into ignored .runtime before an update; uses built-ins so npm ci cannot remove its runtime.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const execute = promisify(execFile);
const root = process.cwd();
const journal = resolve(root, ".runtime/update-state.json");
const record = async (state, message) =>
  writeFile(
    journal,
    JSON.stringify({ state, message, time: new Date().toISOString() }) + "\n",
    { mode: 0o600 },
  );
const args = process.argv.slice(2);
const [
  parent,
  expected,
  target,
  repository,
  branch,
  npmCli,
  releaseTag,
  version,
] = args;
const git = async (...gitArgs) =>
  (
    await execute(
      "git",
      [
        "-c",
        `core.hooksPath=${resolve(root, ".runtime/disabled-hooks")}`,
        "-c",
        "credential.helper=",
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        ...gitArgs,
      ],
      {
        cwd: root,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
    )
  ).stdout.trim();
let installed = false;
try {
  if (
    !/^\d+$/.test(parent ?? "") ||
    !/^[a-f0-9]{40}$/.test(expected ?? "") ||
    !/^[a-f0-9]{40}$/.test(target ?? "") ||
    !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*(?:\.git)?$/.test(
      repository ?? "",
    ) ||
    !/^[A-Za-z0-9][A-Za-z0-9_/-]{0,100}$/.test(branch ?? "") ||
    branch.includes("..") ||
    !npmCli?.endsWith("npm-cli.js") ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "") ||
    releaseTag !== `v${version}`
  )
    throw new Error("Invalid update");
  await record("WAITING", "Waiting for the app to close before updating.");
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      process.kill(Number(parent), 0);
    } catch (error) {
      if (error.code === "ESRCH") break;
      throw error;
    }
    if (Date.now() > deadline) throw new Error("App still active");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (
    (await git("symbolic-ref", "--short", "HEAD")) !== branch ||
    (await git("status", "--porcelain", "--untracked-files=all")) ||
    (await git("rev-parse", "HEAD")) !== expected
  )
    throw new Error("Source changed");
  await git(
    "fetch",
    "--no-tags",
    "--no-recurse-submodules",
    "--",
    repository,
    `refs/heads/${branch}`,
  );
  const branchHead = await git("rev-parse", "FETCH_HEAD");
  await git(
    "fetch",
    "--no-tags",
    "--no-recurse-submodules",
    "--",
    repository,
    `refs/tags/${releaseTag}`,
  );
  if (
    (await git("rev-parse", "FETCH_HEAD^{commit}")) !== target ||
    (await git("merge-base", target, branchHead)) !== target ||
    (await git("merge-base", expected, target)) !== expected
  )
    throw new Error("Upstream changed");
  const remotePackage = JSON.parse(await git("show", `${target}:package.json`));
  if (
    remotePackage.name !== "pursuit-study-companion" ||
    remotePackage.version !== version
  )
    throw new Error("Release version changed");
  // Block upstream commits that would begin tracking local student data.
  const tracked = (await git("ls-tree", "-r", "--name-only", target)).split(
    "\n",
  );
  if (
    tracked.some(
      (p) =>
        /^(?:\.env(?:$|\.)|state\/|study-notes\/|\.runtime\/|submissions\/)/.test(
          p,
        ) && p !== ".env.example",
    )
  )
    throw new Error("Release includes local data paths");
  await record("UPDATING", "Applying the exact reviewed upstream commit.");
  await git("merge", "--ff-only", "--no-edit", target);
  installed = true;
  await record("INSTALLING", "Installing locked dependencies.");
  await execute(
    process.execPath,
    [npmCli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: root, timeout: 300000, maxBuffer: 16 * 1024 * 1024 },
  );
  await record("BUILDING", "Building the updated app.");
  await execute(process.execPath, [npmCli, "run", "dashboard:build"], {
    cwd: root,
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (process.platform === "darwin") {
    await record(
      "BUILDING_NATIVE",
      "Building the updated macOS sign-in helper.",
    );
    await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(root, "scripts/start-macos.ts"),
        "--build-only",
      ],
      { cwd: root, timeout: 300000, maxBuffer: 16 * 1024 * 1024 },
    );
  }
  await record("RESTARTING", "Update built. Restarting the app.");
  await unlink(resolve(root, ".runtime/study-run.lock"));
  await unlink(resolve(root, ".runtime/update.lock"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", resolve(root, "src/dashboard/server.ts")],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  const port = Number(process.env.PURSUIT_DASHBOARD_PORT ?? "4782");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid local port");
  const readyDeadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1500),
        redirect: "error",
      });
      if (
        response.ok &&
        (await response.json()).app === "pursuit-study-companion"
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("Updated app did not become ready");
  await record(
    "UPDATED",
    `Version ${version} installed and the app restarted successfully.${process.platform === "darwin" ? " Reopen the macOS app to load native window changes." : ""}`,
  );
} catch {
  await mkdir(resolve(root, ".runtime"), { recursive: true });
  await record(
    "ERROR",
    installed
      ? "Source updated, but installation or build failed. Run npm ci, npm run dashboard:build, then npm start. Personal data was retained."
      : "Update stopped before changing source. Reopen the app and check your Git status and network.",
  );
  try {
    await unlink(resolve(root, ".runtime/update.lock"));
  } catch {}
  try {
    await unlink(resolve(root, ".runtime/study-run.lock"));
  } catch {}
  process.exitCode = 1;
}
