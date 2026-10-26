import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { catchUpDays, type SavedAnchor } from "../history/catchUp.js";
import type { HistoryStore } from "../history/store.js";
import { LivePursuitClient } from "../pursuit/liveClient.js";
import { enrichCompletion } from "../pursuit/completion.js";
import { PursuitReadError } from "../pursuit/errors.js";
import { localCalendarDate } from "../config/calendar.js";
import { loadState } from "../state/store.js";
import { loadLocalEnvironment } from "../config/environment.js";
import { refreshHistoricalDay } from "../history/refresh.js";
import { classify } from "../classification/index.js";

class SyncPaused extends Error {}
export class DashboardCatchUp {
  private stopRequested = false;
  private idleWaiters: (() => void)[] = [];
  async pause() {
    if (!this.status.running) return;
    this.stopRequested = true;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
  private checkPause() {
    if (this.stopRequested) throw new SyncPaused();
  }
  status = { running: false, message: "", imported: 0, refreshed: 0 };
  private nextCheck = 0;
  constructor(
    private root: string,
    private history: HistoryStore,
    private busy: () => Promise<boolean>,
  ) {}
  async request(force = false) {
    if (this.status.running || (!force && Date.now() < this.nextCheck)) return;
    // Reserve synchronously before awaiting the external-run check.
    this.status.running = true;
    this.stopRequested = false;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    const path = resolve(this.root, ".runtime/study-run.lock");
    let runId: string | undefined;
    try {
      if (await this.busy()) {
        this.status.message = "Sync is waiting for the active run to finish.";
        return;
      }
      try {
        lock = await open(
          path,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
        throw error;
      }
      this.nextCheck = Date.now() + 5 * 60_000;
      this.status.message = "Checking Pursuit for missing days…";
      this.status.imported = 0;
      this.status.refreshed = 0;
      await loadLocalEnvironment();
      runId = this.history.startRun("study", "app-open-catch-up");
      const anchors: SavedAnchor[] = [];
      for (const row of this.history.listDays()) {
        const saved = this.history.day(String(row.date));
        const source = saved?.tasks.find(
          (t) =>
            typeof t.cohort === "string" && typeof t.source_path === "string",
        );
        if (saved?.source === "live" && saved.day_id && source)
          anchors.push({
            date: saved.date,
            dayId: saved.day_id,
            cohort: String(source.cohort),
          });
      }
      const result = await catchUpDays({
        today: localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE),
        anchors,
        load: (selection, cohorts) => {
          this.checkPause();
          return new LivePursuitClient().loadDefinitions(selection, cohorts);
        },
        save: async (day, selection) => {
          this.checkPause();
          const enriched = await enrichCompletion(
            day,
            new LivePursuitClient(undefined, selection),
          );
          const state = await loadState(this.root);
          for (const task of enriched.tasks) {
            state.tasks[String(task.id)] = {
              taskId: task.id,
              protectedKind: task.protectedKind,
              classification: classify(task),
              conceptIds: [],
              completion: task.completed,
              establishedFacts: {},
              generatedContext: {},
              conversationTurns: 0,
              status: task.protectedKind ? "NEEDS_USER" : "READ_ONLY",
              submissionAttempts: [],
            };
          }
          // Index only: never replace notes, local state, or conversation journals.
          this.history.recordDay(enriched, state);
          this.status.imported++;
          if (enriched.tasks.some((t) => t.completionReadFailed))
            throw new PursuitReadError("HTTP");
        },
        progress: (message) => {
          this.status.message = `${message} Added ${this.status.imported} days so far.`;
        },
      });
      for (const anchor of [...anchors].sort((a, b) =>
        b.date.localeCompare(a.date),
      )) {
        if (
          anchor.date >
          localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE)
        )
          continue;
        this.checkPause();
        this.status.message = `Refreshing ${anchor.date} from Pursuit…`;
        const refreshed = await refreshHistoricalDay(
          this.root,
          this.history,
          anchor.date,
        );
        if (refreshed.tasks.some((t) => t.completionReadFailed))
          throw new PursuitReadError("HTTP");
        this.status.refreshed++;
      }
      this.status.message = result.imported
        ? `Fetched ${result.imported} missing days. Refreshed ${this.status.refreshed} saved days. Select a day to generate its study notes.`
        : `Sync finished. Refreshed ${this.status.refreshed} saved days; no additional published days found in the checked range.`;
      if (result.inaccessible)
        this.status.message = `Sync partially completed. ${this.status.message} ${result.inaccessible} candidate reads were access denied; those candidates remain unverified.`;
      this.history.finishRun(
        runId,
        result.inaccessible ? "PARTIAL" : "FINISHED",
        this.status.message,
      );
    } catch (error) {
      this.status.message = `Missing-day check stopped. ${this.status.imported} days added; saved days preserved. ${error instanceof PursuitReadError ? (error.code === "AUTH" ? "Pursuit rejected the token. Sign in to Pursuit, update PURSUIT_TOKEN in the local .env, then click Sync." : error.message) : "Check local configuration and history."}`;
      if (error instanceof SyncPaused)
        this.status.message = `Sync paused for your study import. ${this.status.imported} added days were saved.`;
      if (runId)
        this.history.finishRun(
          runId,
          error instanceof SyncPaused ? "PAUSED" : "ERROR",
          this.status.message,
        );
    } finally {
      try {
        if (lock) {
          await lock.close();
          await unlink(path);
        }
      } finally {
        this.status.running = false;
        if (lock) this.nextCheck = Date.now() + 60 * 60_000;
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
    }
  }
}
