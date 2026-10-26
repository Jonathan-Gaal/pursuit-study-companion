import { DashboardAuth } from "./auth.js";
import { DashboardCatchUp } from "./catchUp.js";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile, spawn } from "node:child_process";
import {
  readFile,
  mkdir,
  open,
  unlink,
  lstat,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import type {
  NextServer,
  NextServerOptions,
  NextBundlerOptions,
} from "next/dist/server/next.js";
import { HistoryStore } from "../history/store.js";
import { loadLocalEnvironment } from "../config/environment.js";
import { refreshHistoricalDay, loadSavedLiveDay } from "../history/refresh.js";
import { dailyRun } from "../dailyRun.js";
import { LivePursuitClient } from "../pursuit/liveClient.js";
import { localCalendarDate } from "../config/calendar.js";
import { validDate } from "../pursuit/parser.js";
import { backfillSavedResources } from "../history/resources.js";
import { dashboardApi } from "./api.js";
import { isLocalDashboardRequest } from "./security.js";
import { readDashboardJson } from "./body.js";
import { settingsStatus, saveSettings } from "./settings.js";
import { UpdateService } from "../updates/service.js";

const next = createRequire(import.meta.url)("next") as (
  options: NextServerOptions & NextBundlerOptions,
) => NextServer;
const root = resolve(process.cwd());
await loadLocalEnvironment();
const port = Number(process.env.PURSUIT_DASHBOARD_PORT ?? "4782");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid local port");
const runtime = resolve(root, ".runtime");
await mkdir(runtime, { recursive: true, mode: 0o700 });
if ((await lstat(runtime)).isSymbolicLink())
  throw new Error("Unsafe runtime directory");
const instanceId = `${process.pid}-${Date.now()}`;
const history = new HistoryStore(root);
const auth = new DashboardAuth(root, history);
await backfillSavedResources(root, history);
const dev = process.argv.includes("--dev");
const app = next({
  dev,
  webpack: true,
  dir: resolve(root, "dashboard"),
  hostname: "127.0.0.1",
  port,
});
await app.prepare();
const handle = app.getRequestHandler();
const updates = new UpdateService(root);
void updates.check(); // Opening the app checks upstream, but never applies code automatically.
const updateTimer = setInterval(() => updates.poll(), 60_000);
updateTimer.unref();
let running: string | null = null;
let updating = false;
async function busy(skipSync = false) {
  if (running || updating || (!skipSync && catchUp.status.running)) return true;
  for (const name of ["study-run.lock", "dashboard-run.lock", "update.lock"]) {
    try {
      await lstat(resolve(runtime, name));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}
async function study(
  date?: string,
  explicitId?: number,
  cohort?: string,
  fixture = false,
) {
  if (await busy()) return false;
  const path = resolve(runtime, "study-run.lock");
  const lock = await open(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  running = "study";
  const runId = history.startRun(
    "study",
    fixture ? "offline-demo" : "dashboard",
  );
  // The durable lock also prevents CLI/backfill writers and updater operations.
  void (async () => {
    try {
      const config = {
        root,
        dryRun: true as const,
        mode: fixture ? ("fixture" as const) : ("live" as const),
        fixturePath: resolve(root, "fixtures/presentation-day.json"),
      };
      const reader = fixture
        ? undefined
        : explicitId !== undefined && cohort
          ? new LivePursuitClient(undefined, { dayId: explicitId, cohort })
          : date &&
              date !==
                localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE)
            ? { loadDay: () => loadSavedLiveDay(root, history, date) }
            : undefined;
      const result = await dailyRun(config, reader);
      history.finishRun(
        runId,
        result.errors.length ? "ERROR" : "FINISHED",
        result.report,
        result.date,
      );
    } catch {
      history.finishRun(
        runId,
        "ERROR",
        "Study import failed. Check local credentials, verified day/cohort, network access and configuration. No Pursuit writes were attempted.",
        date,
      );
    } finally {
      running = null;
      await lock.close();
      await unlink(path);
    }
  })();
  return true;
}
const catchUp = new DashboardCatchUp(root, history, () => busy(true));
const server = createServer(async (req, res) => {
  if (!isLocalDashboardRequest(req.headers.host, req.headers.origin, port)) {
    res.writeHead(403);
    res.end("Local app only");
    return;
  }
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const json = (status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && url.pathname === "/api/settings") {
      json(200, settingsStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      if (await busy()) {
        json(409, { error: "Wait for the active operation to finish." });
        return;
      }
      if (
        !/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))
      ) {
        json(400, { error: "Local JSON required." });
        return;
      }
      try {
        json(200, await saveSettings(root, await readDashboardJson(req)));
      } catch {
        json(400, {
          error:
            "Check your token, exact cohort, verified day IDs, timezone and HTTPS GitHub URL. Configuration was not saved.",
        });
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/updates") {
      json(200, updates.poll());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/updates/check") {
      if (await busy()) {
        json(409, { error: "Wait for the active operation to finish." });
        return;
      }
      json(200, await updates.check());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/updates/apply") {
      if (dev || (await busy())) {
        json(409, {
          error:
            "Updates require the idle production app. Finish your study run first.",
        });
        return;
      }
      if (
        !/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))
      ) {
        json(400, { error: "Local JSON required." });
        return;
      }
      const body = (await readDashboardJson(req)) as { target?: unknown };
      if (
        typeof body?.target !== "string" ||
        Object.keys(body).some((key) => key !== "target")
      ) {
        json(400, { error: "Approve the displayed update commit." });
        return;
      }
      const approved = await updates.approve(body.target);
      const npmCli = process.env.npm_execpath;
      if (!npmCli?.endsWith("npm-cli.js") || !(await lstat(npmCli)).isFile()) {
        json(409, {
          error: "Open the app using npm start so it can install updates.",
        });
        return;
      }
      const lock = await open(resolve(runtime, "update.lock"), "wx", 0o600);
      updating = true;
      let ownsStudyLock = false;
      try {
        // CLI importers also honor this study lock until the app has exited.
        const studyLock = await open(
          resolve(runtime, "study-run.lock"),
          "wx",
          0o600,
        );
        ownsStudyLock = true;
        await studyLock.close();
        const workerPath = resolve(runtime, "update-worker.mjs");
        await copyFile(resolve(root, "scripts/update-worker.mjs"), workerPath);
        const child = spawn(
          process.execPath,
          [
            workerPath,
            String(process.pid),
            approved.current,
            approved.target,
            approved.repository,
            approved.branch,
            npmCli,
            approved.releaseTag,
            approved.version,
          ],
          {
            cwd: root,
            detached: true,
            stdio: "ignore",
            env: { ...process.env },
          },
        );
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        child.unref();
        await lock.close();
        json(202, {
          status: "UPDATING",
          message:
            "Updating and restarting. This tab will reconnect automatically.",
        });
        setTimeout(() => {
          server.close();
          history.close();
          process.exit(0);
        }, 300);
      } catch {
        updating = false;
        await lock.close();
        await unlink(resolve(runtime, "update.lock"));
        if (ownsStudyLock) {
          try {
            await unlink(resolve(runtime, "study-run.lock"));
          } catch {}
        }
        json(409, {
          error: "Could not launch the updater. Source was not changed.",
        });
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/update-result") {
      let result = null;
      try {
        result = JSON.parse(
          await readFile(resolve(runtime, "update-state.json"), "utf8"),
        );
      } catch {}
      json(200, result);
      return;
    }
    if (
      req.method === "POST" &&
      ["/api/import", "/api/demo"].includes(url.pathname)
    ) {
      if (url.pathname === "/api/demo") {
        json((await study(undefined, undefined, undefined, true)) ? 202 : 409, {
          status: "RUNNING",
        });
        return;
      }
      if (
        !/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))
      ) {
        json(400, { error: "Local JSON required." });
        return;
      }
      const body = (await readDashboardJson(req)) as {
        dayId?: unknown;
        cohort?: unknown;
      };
      if (
        !body ||
        !Number.isSafeInteger(body.dayId) ||
        Number(body.dayId) <= 0 ||
        typeof body.cohort !== "string" ||
        !body.cohort.trim() ||
        body.cohort.length > 200 ||
        /[\r\n\x00]/.test(body.cohort) ||
        Object.keys(body).some((key) => !["dayId", "cohort"].includes(key))
      ) {
        json(400, { error: "Provide a verified day ID and exact cohort." });
        return;
      }
      json(
        (await study(undefined, Number(body.dayId), body.cohort)) ? 202 : 409,
        { status: "RUNNING" },
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sync") {
      if (
        url.search ||
        req.headers["transfer-encoding"] ||
        Number(req.headers["content-length"] ?? 0) !== 0
      ) {
        json(400, { error: "Sync requires an empty request." });
        return;
      }
      if (await busy()) {
        json(409, { error: "Wait for the active operation to finish." });
        return;
      }
      void catchUp.request(true);
      json(202, { status: "SYNCING" });
      return;
    }
    const result = await dashboardApi(req, {
      root,
      port,
      history,
      auth,
      openSignIn:
        process.platform === "darwin"
          ? async () => {
              await promisify(execFile)("/usr/bin/open", [
                resolve(root, "Pursuit Study Companion.app"),
                "--args",
                "--sign-in",
              ]);
            }
          : undefined,
      afterSignIn: () => {
        void catchUp.request(true);
      },
      buildId: dev ? "development" : "production",
      catchUp: () => catchUp.status,
      active: async () => ((await busy()) ? (running ?? "operation") : null),
      progress: async () => null,
      start: (_kind, date) => study(date),
      readJson: () => readDashboardJson(req),
      refreshDay: async (date) => {
        const started = await study(date);
        if (!started) throw new Error("Busy");
      },
    });
    if (result) {
      json(
        result.status,
        url.pathname === "/api/status"
          ? {
              ...(result.body as object),
              app: "pursuit-study-companion",
              instance: instanceId,
            }
          : result.body,
      );
      return;
    }
    await handle(req, res);
  } catch {
    if (!res.headersSent)
      json(409, {
        error:
          "The operation stopped safely. Check local configuration and any active operation.",
      });
    else res.end();
  }
});
server.on("error", () => {
  console.error(
    "Could not open the local app port. Check local permissions and whether another app is using this port.",
  );
  history.close();
  process.exit(1);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Pursuit Study Companion: http://127.0.0.1:${port}`),
);
