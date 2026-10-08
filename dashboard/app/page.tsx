"use client";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import LearningHub, { type LearningMode } from "../components/LearningHub";
import Annotations from "../components/Annotations";
import Resources from "../components/Resources";
import Obsidian from "../components/Obsidian";
import TaskAssetDetails from "../components/TaskAssets";
import { parseTaskAssets } from "../../src/learning/taskAssets";
import { studyTarget, assignmentAtHeading } from "../lib/studyTarget";
import type { UpdateState } from "../../src/updates/service";

type Summary = {
  date: string;
  source: string;
  day_id: number | null;
  task_count: number;
  completed_count: number;
};
type Task = {
  task_id: number;
  title: string;
  completion: number | null;
  protected_kind: string | null;
  classification: string | null;
  content: string | null;
  assets_json?: string | null;
};
type Run = {
  id: string;
  date: string | null;
  status: string;
  started_at: string;
  output: string | null;
};
type Detail = Summary & {
  tasks: Task[];
  runs: Run[];
  noteContent: string | null;
};
type Status = {
  today: string;
  running: string | null;
  days: Summary[];
  runs: Run[];
  instance: string;
};
type Settings = {
  tokenConfigured: boolean;
  cohort: string;
  dayIds: string;
  timeZone: string;
  upstream: string;
};
type Tab =
  | "notes"
  | "assignments"
  | "resources"
  | "obsidian"
  | "runs"
  | "settings"
  | LearningMode;
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "The request failed.");
  return value;
}
async function action(path: string) {
  const response = await fetch(path, { method: "POST" });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? "The operation could not start.");
  return value;
}
export default function StudyCompanion() {
  const [status, setStatus] = useState<Status | null>(null);
  const [date, setDate] = useState("");
  const [followToday, setFollowToday] = useState(true);
  const [day, setDay] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  const [lesson, setLesson] = useState<number | null>(null);
  const [targetTask, setTargetTask] = useState<number | null>(null);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [updates, setUpdates] = useState<UpdateState | null>(null);
  const [updating, setUpdating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importId, setImportId] = useState("");
  const [importCohort, setImportCohort] = useState("");
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const current = await request<Status>("/api/status");
      setStatus(current);
      if (
        updating &&
        status?.instance &&
        current.instance !== status.instance
      ) {
        setUpdating(false);
        window.location.reload();
      }
    } catch {
      if (!updating)
        setError("Could not reach the local app. Start it with npm start.");
    }
  }, [updating, status?.instance]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedDate = params.get("date");
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      setDate(savedDate);
      setFollowToday(false);
    }
    const task = params.get("lesson");
    if (task && /^[1-9]\d*$/.test(task)) setLesson(Number(task));
    void request<Settings>("/api/settings")
      .then((value) => {
        setSettings(value);
        setImportCohort(value.cohort);
        if (!value.tokenConfigured) setTab("settings");
      })
      .catch(() => {});
    void request<UpdateState>("/api/updates")
      .then(setUpdates)
      .catch(() => {});
    void request<{ message?: string } | null>("/api/update-result")
      .then((value) => {
        if (value?.message) setNotice(value.message);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
      void request<UpdateState>("/api/updates")
        .then(setUpdates)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (followToday && status) setDate(status.today);
  }, [followToday, status?.today]);
  useEffect(() => {
    if (!date || !status?.days.some((value) => value.date === date)) {
      setDay(null);
      return;
    }
    let cancelled = false;
    void request<Detail>(`/api/day?date=${date}`)
      .then((value) => {
        if (!cancelled) setDay(value);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this saved day.");
      });
    return () => {
      cancelled = true;
    };
  }, [date, status]);
  const current = day?.date === date ? day : null;
  useEffect(() => {
    const id =
      targetLine === 0
        ? "personal-annotations"
        : targetLine
          ? `study-heading-${targetLine}`
          : targetTask && current?.noteContent && tab === "notes"
            ? studyTarget(current.noteContent, targetTask)
            : targetTask && tab === "assignments"
              ? `assignment-${targetTask}`
              : null;
    if (id)
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [targetTask, targetLine, current?.noteContent, tab]);
  async function perform(operation: () => Promise<unknown>, success: string) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operation failed.");
    } finally {
      setPending(false);
    }
  }
  function navigate(selected: string, task?: number, line?: number) {
    setFollowToday(false);
    setDate(selected);
    setLesson(null);
    setTargetTask(task ?? null);
    setTargetLine(line ?? null);
    setTab(task ? "assignments" : "notes");
    window.history.replaceState(
      null,
      "",
      `/?date=${selected}${task ? `&assignment=${task}` : ""}`,
    );
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const busy = pending || !!status?.running || updating;
  const selectedLesson = current?.tasks.find(
    (task) => task.task_id === lesson && !task.protected_kind,
  );
  const labels: [Tab, string][] = [
    ["notes", "Study notes"],
    ["assignments", "Assignments"],
    ["resources", "Resources & deliverables"],
    ["search", "Search"],
    ["review", "Self-test"],
    ["map", "Concept map"],
    ["weekly", "Weekly recap"],
    ["obsidian", "Obsidian"],
    ["runs", "History"],
    ["settings", "Settings"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          Pursuit<span className="study-wordmark">Study Companion</span>
        </a>
        <button
          className={`day-link ${followToday ? "selected" : ""}`}
          onClick={() => {
            setFollowToday(true);
            setLesson(null);
            setTargetTask(null);
            setTab("notes");
            window.history.replaceState(null, "", "/");
          }}
        >
          Today
        </button>
        <div className="sidebar-heading">
          SAVED DAYS <span>{status?.days.length ?? 0}</span>
        </div>
        <nav aria-label="Saved days">
          {status?.days.map((value) => (
            <button
              className={`day-link ${date === value.date ? "selected" : ""}`}
              key={value.date}
              onClick={() => navigate(value.date)}
            >
              <span>
                {value.date}
                <small>
                  {value.source === "fixture"
                    ? "Offline example"
                    : `Day ${value.day_id ?? "unknown"}`}
                </small>
              </span>
              <span className="day-count">
                {value.completed_count ?? 0}/{value.task_count}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          Your notes stay on this computer.
          <small>Unofficial personal study tool</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>PURSUIT STUDY COMPANION</span>
          <span>
            {status?.running ? "Study import running" : "Local workspace"}
          </span>
        </header>
        <section className="heading">
          <div>
            <p className="eyebrow">LEARN AT YOUR OWN PACE</p>
            <h1>{date || "Your learning library"}</h1>
            <p>Curriculum, deeper study, and the work you complete yourself.</p>
          </div>
          <div className="heading-actions">
            <button
              disabled={busy || !settings?.tokenConfigured}
              onClick={() =>
                void perform(
                  () =>
                    action(
                      `/api/study${date && date !== status?.today ? `?date=${date}` : ""}`,
                    ),
                  "Study import started. Saved notes will be reused.",
                )
              }
            >
              Fetch lessons & study notes
            </button>
          </div>
        </section>
        {error && (
          <p role="alert" className="study-alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="study-notice">
            {notice}
          </p>
        )}
        {updating && (
          <p role="status" className="study-notice">
            Updating and rebuilding the app. This tab will reconnect when ready.
            If it fails, check .runtime/update-state.json and reopen with npm
            start.
          </p>
        )}
        {updates?.state === "AVAILABLE" && (
          <div className="study-notice">
            <strong>A new version is available.</strong>{" "}
            <span>
              {updates.current?.slice(0, 7)} → {updates.target?.slice(0, 7)}
            </span>{" "}
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await request("/api/updates/apply", {
                    target: updates.target,
                  });
                  setUpdating(true);
                }, "Update requested.")
              }
            >
              Update & restart
            </button>
          </div>
        )}
        <div className="study-tabs" role="tablist" aria-label="Study tools">
          {labels.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setLesson(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <section className="panel">
          {tab === "settings" && settings && (
            <div className="panel-body">
              <h2>Connect your own Pursuit account</h2>
              <p>
                Your bearer token is stored only in the ignored local .env file.
                Each classmate uses their own token and saved data.
              </p>
              <form
                className="study-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform(async () => {
                    const result = await request<Settings>("/api/settings", {
                      ...settings,
                      tokenConfigured: undefined,
                      token,
                    });
                    setSettings(result);
                    setToken("");
                    setImportCohort(result.cohort);
                    setUpdates(
                      await request<UpdateState>("/api/updates/check", {}),
                    );
                  }, "Local settings saved.");
                }}
              >
                <label>
                  Pursuit bearer token
                  <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    placeholder={
                      settings.tokenConfigured
                        ? "Leave blank to keep the saved token"
                        : "Paste your own token locally"
                    }
                    onChange={(event) => setToken(event.target.value)}
                  />
                </label>
                <label>
                  Exact cohort name
                  <input
                    required
                    value={settings.cohort}
                    onChange={(event) =>
                      setSettings({ ...settings, cohort: event.target.value })
                    }
                    placeholder="L2 - September 2026"
                  />
                </label>
                <label>
                  Verified day IDs, separated by commas
                  <input
                    required
                    value={settings.dayIds}
                    onChange={(event) =>
                      setSettings({ ...settings, dayIds: event.target.value })
                    }
                    placeholder="1648"
                  />
                </label>
                <label>
                  Timezone
                  <input
                    required
                    value={settings.timeZone}
                    onChange={(event) =>
                      setSettings({ ...settings, timeZone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Canonical GitHub repository
                  <input
                    type="url"
                    value={settings.upstream}
                    onChange={(event) =>
                      setSettings({ ...settings, upstream: event.target.value })
                    }
                    placeholder="Use the original publisher repository, not your fork"
                  />
                </label>
                <button disabled={busy} type="submit">
                  Save local settings
                </button>
              </form>
              <h2>Import a specific day</h2>
              <p>
                Use a verified day ID and its exact cohort. Imported days appear
                in the sidebar.
              </p>
              <form
                className="study-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform(
                    () =>
                      request("/api/import", {
                        dayId: Number(importId),
                        cohort: importCohort,
                      }),
                    "Historical import started.",
                  );
                }}
              >
                <label>
                  Day ID
                  <input
                    type="number"
                    min="1"
                    required
                    value={importId}
                    onChange={(event) => setImportId(event.target.value)}
                  />
                </label>
                <label>
                  Cohort
                  <input
                    required
                    value={importCohort}
                    onChange={(event) => setImportCohort(event.target.value)}
                  />
                </label>
                <button disabled={busy || !settings.tokenConfigured}>
                  Import curriculum & notes
                </button>
              </form>
              <h2>App updates</h2>
              <p>{updates?.message ?? "Checking the update source…"}</p>
              {updates?.checkedAt && (
                <p className="muted">
                  Last checked {new Date(updates.checkedAt).toLocaleString()}
                </p>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void perform(
                    async () => setUpdates(await action("/api/updates/check")),
                    "Update check finished.",
                  )
                }
              >
                Check for updates
              </button>
              {updates?.state === "AVAILABLE" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await request("/api/updates/apply", {
                        target: updates.target,
                      });
                      setUpdating(true);
                    }, "Update requested.")
                  }
                >
                  Update & restart
                </button>
              )}
              <h2>Try an offline example</h2>
              <p>
                No account or network needed. Example curriculum is labeled as a
                fixture.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(
                    () => action("/api/demo"),
                    "Offline example started. Select its saved date when it finishes.",
                  )
                }
              >
                Load example
              </button>
            </div>
          )}
          {tab === "assignments" && (
            <div className="panel-body">
              <div className="section-title">
                <h2>Assignments</h2>
                <span className="badge">Completion reported by Pursuit</span>
              </div>
              <p className="muted">
                Use this list to plan your work. Complete assignments in Pursuit
                yourself.
              </p>
              {current?.tasks.map((task) => (
                <article
                  className="task-row"
                  key={task.task_id}
                  id={`assignment-${task.task_id}`}
                  tabIndex={-1}
                >
                  <div>
                    <h3>
                      {task.protected_kind
                        ? task.protected_kind === "ASSESSMENT"
                          ? "Assessment — complete manually"
                          : "Weekly Survey — complete manually"
                        : task.title}
                    </h3>
                    {!task.protected_kind && (
                      <>
                        <span className="badge">
                          {task.classification?.toLowerCase()}
                        </span>
                        {task.content && (
                          <details>
                            <summary>Read lesson</summary>
                            <p style={{ whiteSpace: "pre-wrap" }}>
                              {task.content}
                            </p>
                          </details>
                        )}
                        {parseTaskAssets(task.assets_json) && (
                          <TaskAssetDetails
                            assets={parseTaskAssets(task.assets_json)!}
                          />
                        )}
                      </>
                    )}
                  </div>
                  <span className="badge">
                    {task.completion === 1
                      ? "Complete"
                      : task.completion === 0
                        ? "Incomplete"
                        : "Unknown"}
                  </span>
                </article>
              ))}
              {!current && (
                <p>
                  No curriculum saved for this date yet. Fetch today or import a
                  verified historical day in Settings.
                </p>
              )}
            </div>
          )}
          {tab === "notes" && (
            <div className="panel-body">
              {lesson && (
                <div id="lesson-source">
                  <h2>{selectedLesson?.title ?? "Saved lesson"}</h2>
                  <button onClick={() => setLesson(null)}>Close source</button>
                  <ReactMarkdown skipHtml components={{ img: () => null }}>
                    {selectedLesson?.content ??
                      "No ordinary lesson source is available for this selection."}
                  </ReactMarkdown>
                </div>
              )}
              {current?.noteContent ? (
                <>
                  <div className="section-title">
                    <h2>Daily learning</h2>
                    <button
                      onClick={() =>
                        void perform(
                          () => copy(current.noteContent!),
                          "Markdown copied.",
                        )
                      }
                    >
                      {copied ? "Copied" : "Copy Markdown"}
                    </button>
                  </div>
                  <article className="markdown">
                    <ReactMarkdown
                      skipHtml
                      components={{
                        img: () => null,
                        h1: ({ node, children }) => (
                          <h1
                            id={`study-heading-${node?.position?.start.line}`}
                            tabIndex={-1}
                          >
                            {children}
                          </h1>
                        ),
                        h2: ({ node, children }) => (
                          <h2
                            id={`study-heading-${node?.position?.start.line}`}
                            tabIndex={-1}
                          >
                            {children}
                          </h2>
                        ),
                        h3: ({ node, children }) => (
                          <h3
                            id={`study-heading-${node?.position?.start.line}`}
                            tabIndex={-1}
                          >
                            {children}
                            {assignmentAtHeading(
                              current.noteContent!,
                              node?.position?.start.line ?? 0,
                            ) && <span />}
                          </h3>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            onClick={(event) => {
                              if (
                                href?.startsWith("/?") &&
                                !event.metaKey &&
                                !event.ctrlKey
                              ) {
                                event.preventDefault();
                                const params = new URLSearchParams(
                                  href.slice(2),
                                );
                                const nextDate = params.get("date");
                                if (nextDate) {
                                  setDate(nextDate);
                                  setFollowToday(false);
                                  setLesson(
                                    Number(params.get("lesson")) || null,
                                  );
                                }
                              }
                            }}
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {current.noteContent}
                    </ReactMarkdown>
                  </article>
                  <Annotations date={date} />
                </>
              ) : (
                <div className="empty">
                  <h2>Your study library starts here</h2>
                  <p>
                    Connect your account in Settings, then fetch lessons and
                    study notes. You can also try the offline example.
                  </p>
                  <button onClick={() => setTab("settings")}>
                    Open Settings
                  </button>
                </div>
              )}
            </div>
          )}
          {["search", "review", "map", "weekly"].includes(tab) && (
            <LearningHub
              mode={tab as LearningMode}
              date={date || status?.today || ""}
              navigate={navigate}
              copyRecap={(text) => copy(text)}
              recapCopied={copied}
            />
          )}
          {tab === "resources" && (
            <Resources date={date} navigate={navigate} taskId={targetTask} />
          )}
          {tab === "obsidian" && <Obsidian date={date} />}
          {tab === "runs" && (
            <div className="panel-body">
              <h2>Study import history</h2>
              {status?.runs.map((run) => (
                <details key={run.id}>
                  <summary>
                    {run.date ?? "Import"} · {run.status} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </summary>
                  <pre>{run.output}</pre>
                </details>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
