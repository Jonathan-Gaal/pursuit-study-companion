import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Day, LocalState } from "../types/index.js";
import type { AssignmentProgress } from "../reporting/assignmentProgress.js";
import { redact } from "../reporting/security.js";
import { detectProtection } from "../pursuit/protection.js";
import { validDate } from "../pursuit/parser.js";
import {
  taskAssets,
  emptyTaskAssets,
  type TaskAssets,
} from "../learning/taskAssets.js";

interface HistoryDay {
  date: string;
  day_id: number | null;
  source: string;
  note: string | null;
  updated_at: string;
}

export function safeHistoryText(value: string): string {
  return redact(value, [
    process.env.PURSUIT_TOKEN ?? "",
    process.env.GEMINI_API_KEY ?? "",
    process.env.GROQ_API_KEY ?? "",
  ]);
}

/** Local history is an index, never an authority for submission permission. */
export class HistoryStore {
  private db: DatabaseSync;
  constructor(root: string) {
    const dir = resolve(root, "state");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (lstatSync(dir).isSymbolicLink())
      throw new Error("Unsafe history directory");
    const path = resolve(dir, "pursuit.db");
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        if (lstatSync(file).isSymbolicLink())
          throw new Error("Unsafe history file");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    this.db = new DatabaseSync(path);
    const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1 && version !== 2 && version !== 3) {
      this.db.close();
      throw new Error("Unsupported history database version");
    }
    chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY, day_id INTEGER, source TEXT NOT NULL DEFAULT 'legacy',
        note TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (
        date TEXT NOT NULL REFERENCES days(date), task_id INTEGER NOT NULL,
        title TEXT NOT NULL, classification TEXT, completion INTEGER,
        protected_kind TEXT, automation_status TEXT, reason TEXT, sent INTEGER DEFAULT 0,
        PRIMARY KEY(date, task_id));
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, date TEXT, source TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, output TEXT);
      CREATE TABLE IF NOT EXISTS imports (key TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS lesson_sources (
        date TEXT NOT NULL REFERENCES days(date), task_id INTEGER NOT NULL,
        content TEXT, concept_ids TEXT NOT NULL, source_path TEXT, cohort TEXT,
        PRIMARY KEY(date,task_id));
      CREATE TABLE IF NOT EXISTS annotations (
        date TEXT PRIMARY KEY REFERENCES days(date), text TEXT NOT NULL,
        revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews (
        card_id TEXT PRIMARY KEY, date TEXT NOT NULL REFERENCES days(date),
        rating TEXT NOT NULL, interval_days INTEGER NOT NULL,
        due_at TEXT NOT NULL, reviewed_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_assets (
        date TEXT NOT NULL, task_id INTEGER NOT NULL, snapshot TEXT NOT NULL,
        updated_at TEXT NOT NULL, PRIMARY KEY(date,task_id),
        FOREIGN KEY(date,task_id) REFERENCES tasks(date,task_id));
      PRAGMA user_version=3;`);
  }
  close() {
    this.db.close();
  }
  recordTaskAssets(date: string, taskId: number, assets: TaskAssets) {
    if (!validDate(date) || !Number.isSafeInteger(taskId))
      throw new Error("Invalid task resource identity");
    const task = this.db
      .prepare("SELECT protected_kind FROM tasks WHERE date=? AND task_id=?")
      .get(date, taskId);
    if (!task) throw new Error("Task resource has no saved assignment");
    const snapshot = safeHistoryText(
      JSON.stringify(task.protected_kind ? emptyTaskAssets() : assets),
    );
    if (Buffer.byteLength(snapshot) > 64000)
      throw new Error("Task resource snapshot exceeds size limit");
    this.db
      .prepare(
        `INSERT INTO task_assets VALUES (?,?,?,?) ON CONFLICT(date,task_id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at`,
      )
      .run(date, taskId, snapshot, new Date().toISOString());
  }
  assetEntries() {
    return this.db
      .prepare(
        `SELECT a.date,a.task_id,a.snapshot,a.updated_at,t.title,t.completion,d.source
      FROM task_assets a JOIN tasks t ON a.date=t.date AND a.task_id=t.task_id
      JOIN days d ON a.date=d.date WHERE t.protected_kind IS NULL ORDER BY a.date DESC,a.task_id`,
      )
      .all();
  }
  updateRecoveredTitle(date: string, taskId: number, title: string) {
    this.db
      .prepare(
        "UPDATE tasks SET title=? WHERE date=? AND task_id=? AND protected_kind IS NULL AND title LIKE 'Task %'",
      )
      .run(safeHistoryText(title).slice(0, 500), date, taskId);
  }
  annotation(date: string) {
    const row = this.db
      .prepare("SELECT * FROM annotations WHERE date=?")
      .get(date);
    return row ?? { date, text: "", revision: 0, updated_at: null };
  }
  saveAnnotation(date: string, text: string, revision: number) {
    if (
      !validDate(date) ||
      !this.day(date) ||
      typeof text !== "string" ||
      Buffer.byteLength(text) > 32000 ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error("Invalid annotation");
    this.transaction(() => {
      if (this.annotation(date).revision !== revision)
        throw new Error("Annotation changed; reload before saving");
      this.db
        .prepare(
          `INSERT INTO annotations VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET text=excluded.text,revision=excluded.revision,updated_at=excluded.updated_at`,
        )
        .run(
          date,
          safeHistoryText(text),
          revision + 1,
          new Date().toISOString(),
        );
    });
    return this.annotation(date);
  }
  annotations() {
    return this.db
      .prepare("SELECT * FROM annotations ORDER BY date DESC")
      .all();
  }
  reviews() {
    return this.db.prepare("SELECT * FROM reviews").all();
  }
  recordReview(
    cardId: string,
    date: string,
    rating: "again" | "hard" | "good" | "easy",
    now = new Date(),
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(cardId) ||
      !validDate(date) ||
      !this.day(date) ||
      !["again", "hard", "good", "easy"].includes(rating)
    )
      throw new Error("Invalid review");
    this.transaction(() => {
      const previous = this.db
        .prepare("SELECT interval_days FROM reviews WHERE card_id=?")
        .get(cardId);
      const interval = Math.min(
        60,
        rating === "again"
          ? 1
          : rating === "hard"
            ? Math.max(
                1,
                Math.round(Number(previous?.interval_days ?? 2) * 1.2),
              )
            : rating === "good"
              ? Math.max(
                  3,
                  Math.round(Number(previous?.interval_days ?? 1) * 2),
                )
              : Math.max(
                  7,
                  Math.round(Number(previous?.interval_days ?? 1) * 3),
                ),
      );
      this.db
        .prepare(
          `INSERT INTO reviews VALUES (?,?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET rating=excluded.rating,interval_days=excluded.interval_days,due_at=excluded.due_at,reviewed_at=excluded.reviewed_at`,
        )
        .run(
          cardId,
          date,
          rating,
          interval,
          new Date(now.getTime() + interval * 86400000).toISOString(),
          now.toISOString(),
        );
    });
  }
  private transaction(work: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  recordDay(day: Day, state: LocalState) {
    if (!validDate(day.date)) throw new Error("Invalid history date");
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO days VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET day_id=coalesce(excluded.day_id,days.day_id),
        source=excluded.source,note=excluded.note,updated_at=excluded.updated_at`,
        )
        .run(
          day.date,
          day.dayId ?? null,
          day.source ?? "fixture",
          state.days[day.date]?.note ?? null,
          new Date().toISOString(),
        );
      for (const task of day.tasks) {
        const stored = state.tasks[String(task.id)];
        this.db
          .prepare(
            `INSERT INTO lesson_sources VALUES (?,?,?,?,?,?)
          ON CONFLICT(date,task_id) DO UPDATE SET content=excluded.content,
          concept_ids=excluded.concept_ids,source_path=coalesce(excluded.source_path,lesson_sources.source_path),
          cohort=coalesce(excluded.cohort,lesson_sources.cohort)`,
          )
          .run(
            day.date,
            task.id,
            task.protectedKind ? null : safeHistoryText(task.text),
            JSON.stringify(
              task.protectedKind ? [] : (stored?.conceptIds ?? []),
            ),
            day.sourcePath ?? null,
            day.cohort ?? null,
          );
        const title =
          task.protectedKind === "ASSESSMENT"
            ? "Assessment — complete manually"
            : task.protectedKind === "WEEKLY_SURVEY"
              ? "Weekly Survey — complete manually"
              : safeHistoryText(task.title);
        this.db
          .prepare(
            `INSERT INTO tasks(date,task_id,title,classification,completion,protected_kind)
          VALUES (?,?,?,?,?,?) ON CONFLICT(date,task_id) DO UPDATE SET title=excluded.title,
          classification=excluded.classification,completion=excluded.completion,protected_kind=excluded.protected_kind`,
          )
          .run(
            day.date,
            task.id,
            title,
            stored?.classification.classification ?? null,
            task.completed === null ? null : Number(task.completed),
            task.protectedKind,
          );
        this.recordTaskAssets(day.date, task.id, taskAssets(task));
      }
    });
  }
  importState(state: LocalState) {
    if (
      this.db.prepare("SELECT key FROM imports WHERE key='legacy-state'").get()
    )
      return;
    this.transaction(() => {
      for (const [date, day] of Object.entries(state.days)) {
        if (
          !validDate(date) ||
          !day ||
          !Array.isArray(day.taskIds) ||
          typeof day.note !== "string"
        )
          throw new Error("Invalid legacy day history");
        this.db
          .prepare("INSERT OR IGNORE INTO days VALUES (?,NULL,'legacy',?,?)")
          .run(date, day.note, new Date().toISOString());
        for (const id of day.taskIds) {
          const task = state.tasks[String(id)];
          if (!task) continue;
          const title =
            task.protectedKind === "ASSESSMENT"
              ? "Assessment — complete manually"
              : task.protectedKind === "WEEKLY_SURVEY"
                ? "Weekly Survey — complete manually"
                : `Task ${id}`;
          this.db
            .prepare(
              `INSERT OR IGNORE INTO tasks(date,task_id,title,classification,completion,protected_kind)
            VALUES (?,?,?,?,?,?)`,
            )
            .run(
              date,
              id,
              title,
              task.classification.classification,
              task.completion === null ? null : Number(task.completion),
              task.protectedKind,
            );
        }
      }
      this.db.prepare("INSERT INTO imports VALUES ('legacy-state')").run();
    });
  }
  recordProgress(progress: AssignmentProgress) {
    if (!progress.date) return;
    if (!validDate(progress.date)) throw new Error("Invalid history date");
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO days VALUES (?,?,'live',NULL,?) ON CONFLICT(date)
        DO UPDATE SET day_id=coalesce(excluded.day_id,days.day_id),updated_at=excluded.updated_at`,
        )
        .run(progress.date!, progress.dayId ?? null, progress.updatedAt);
      for (const task of progress.tasks) {
        const protection = detectProtection({ title: task.title });
        const title =
          protection === "ASSESSMENT"
            ? "Assessment — complete manually"
            : protection === "WEEKLY_SURVEY"
              ? "Weekly Survey — complete manually"
              : safeHistoryText(task.title);
        this.db
          .prepare(
            `INSERT INTO tasks(date,task_id,title,automation_status,reason,sent,protected_kind)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(date,task_id) DO UPDATE SET
          title=CASE WHEN tasks.protected_kind IS NULL THEN excluded.title ELSE tasks.title END,
          automation_status=excluded.automation_status,reason=CASE WHEN tasks.protected_kind IS NULL THEN excluded.reason ELSE NULL END,sent=excluded.sent,
          protected_kind=coalesce(tasks.protected_kind,excluded.protected_kind),
          completion=CASE WHEN excluded.automation_status IN ('COMPLETE','ALREADY_COMPLETE') THEN 1 ELSE tasks.completion END`,
          )
          .run(
            progress.date!,
            task.taskId,
            title,
            task.status,
            !protection && task.reason ? safeHistoryText(task.reason) : null,
            task.sent ?? 0,
            protection,
          );
      }
    });
  }
  startRun(
    kind: "study" | "tasks",
    source: string,
    date: string | null = null,
  ) {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO runs VALUES (?,?,?,?,?,NULL,'RUNNING',NULL)")
      .run(id, kind, date, source, new Date().toISOString());
    return id;
  }
  finishRun(
    id: string,
    status: string,
    output: string,
    date: string | null = null,
  ) {
    this.db
      .prepare(
        "UPDATE runs SET status=?,output=?,finished_at=?,date=coalesce(?,date) WHERE id=?",
      )
      .run(
        status,
        safeHistoryText(output).slice(-60000),
        new Date().toISOString(),
        date,
        id,
      );
  }
  listDays() {
    return this.db
      .prepare(
        `SELECT d.*, count(t.task_id) task_count,
      sum(CASE WHEN t.completion=1 THEN 1 ELSE 0 END) completed_count
      FROM days d LEFT JOIN tasks t ON d.date=t.date GROUP BY d.date ORDER BY d.date DESC`,
      )
      .all();
  }
  day(date: string) {
    const day = this.db.prepare("SELECT * FROM days WHERE date=?").get(date) as
      HistoryDay | undefined;
    return day
      ? {
          ...day,
          tasks: this.db
            .prepare(
              `SELECT t.*, s.content, s.concept_ids, s.source_path, s.cohort,a.snapshot assets_json
              FROM tasks t LEFT JOIN lesson_sources s ON t.date=s.date AND t.task_id=s.task_id
              LEFT JOIN task_assets a ON t.date=a.date AND t.task_id=a.task_id
              WHERE t.date=? ORDER BY t.task_id`,
            )
            .all(date),
          runs: this.db
            .prepare(
              "SELECT * FROM runs WHERE date=? ORDER BY started_at DESC LIMIT 100",
            )
            .all(date),
        }
      : null;
  }
  runs() {
    return this.db
      .prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT 100")
      .all();
  }
  runningRun(id: string) {
    return !!this.db
      .prepare("SELECT id FROM runs WHERE id=? AND status='RUNNING'")
      .get(id);
  }
  setRunDate(id: string, date: string) {
    this.db.prepare("UPDATE runs SET date=? WHERE id=?").run(date, id);
  }
  importRun(
    id: string,
    date: string,
    timestamp: string,
    status: string,
    output: string,
  ) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO runs VALUES (?,'tasks',?,'legacy import',?,?,?,?)",
      )
      .run(
        id,
        date,
        timestamp,
        timestamp,
        status,
        safeHistoryText(output).slice(-60000),
      );
  }
}
