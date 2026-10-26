"use client";
import { dateLabel } from "../lib/dateLabel";
import {
  studySections,
  withStudyAdditions,
} from "../../src/learning/studySections";
import type { SavedStudyAddition } from "../../src/learning/studyExpansion";
import StudyExpansion from "../components/StudyExpansion";
import { sequenceDays, type DaySort } from "../lib/daySequence";
import { relativeDay } from "../lib/relativeDay";
import { pursuitDayUrl } from "../lib/pursuitLink";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import LearningHub, { type LearningMode } from "../components/LearningHub";
import Annotations from "../components/Annotations";
import Resources from "../components/Resources";
import Obsidian from "../components/Obsidian";
import TaskAssetDetails, { DeliverableIcon } from "../components/TaskAssets";
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
  concept_ids?: string | null;
  cohort?: string | null;
  assets_json?: string | null;
};
type Run = {
  id: string;
  date: string | null;
  status: string;
  kind?: string;
  source?: string;
  finished_at?: string | null;
  started_at: string;
  output: string | null;
};
type Detail = Summary & {
  tasks: Task[];
  runs: Run[];
  noteContent: string | null;
  studyAdditions?: SavedStudyAddition[];
};
type Status = {
  auth?: { state: string; message: string };
  catchUp?: { running: boolean; message: string; imported: number };
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
  | "deliverables"
  | "obsidian"
  | "runs"
  | "settings"
  | LearningMode;

const label = (text: string) => text.replaceAll("_", " ").toLowerCase();
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
  const [daySort, setDaySort] = useState<DaySort>("newest");
  const [tab, setTab] = useState<Tab>("assignments");
  const [lesson, setLesson] = useState<number | null>(null);
  const [targetTask, setTargetTask] = useState<number | null>(null);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [signInMessage, setSignInMessage] = useState("");
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
    const connected = () => {
      void request<Settings>("/api/settings").then(setSettings);
      void refresh();
      setNotice("Connected to Pursuit. Sync started.");
    };
    window.addEventListener("pursuit-auth-updated", connected);
    return () => window.removeEventListener("pursuit-auth-updated", connected);
  }, [refresh]);
  useEffect(() => {
    try {
      const savedSort = localStorage.getItem("pursuit-day-sort");
      if (savedSort === "oldest" || savedSort === "newest")
        setDaySort(savedSort);
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const savedDate = params.get("date");
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      setDate(savedDate);
      setFollowToday(false);
    }
    const assignment = params.get("assignment");
    if (assignment && /^[1-9]\d*$/.test(assignment)) {
      setTargetTask(Number(assignment));
      setTab("assignments");
    }
    const task = params.get("lesson");
    if (task && /^[1-9]\d*$/.test(task)) {
      setLesson(Number(task));
      setTab("notes");
    }
    const studyTask = params.get("studyTask");
    const studyLine = params.get("studyLine");
    if (studyTask && /^[1-9]\d*$/.test(studyTask)) {
      setTargetTask(Number(studyTask));
      setTab("notes");
    }
    if (studyLine && /^[1-9]\d*$/.test(studyLine)) {
      setTargetLine(Number(studyLine));
      setTab("notes");
    }
    if (params.get("annotation") === "1") {
      setTargetLine(0);
      setTab("notes");
    }
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
    const check = () => {
      if (document.visibilityState === "visible")
        void request<UpdateState>("/api/updates")
          .then(setUpdates)
          .catch(() => {});
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
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
      tab === "notes" && targetLine === 0
        ? "personal-annotations"
        : tab === "notes" && targetLine
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
      `/?date=${selected}${task ? `&assignment=${task}` : line === 0 ? "&annotation=1" : line ? `&studyLine=${line}` : ""}`,
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
  const viewingToday = !!date && date === status?.today;
  const platformDayUrl = current ? pursuitDayUrl(current) : null;
  const runs = current
    ? [...current.runs, ...(status?.runs.filter((run) => !run.date) ?? [])]
    : (status?.runs ?? []);
  function changeDaySort(order: DaySort) {
    setDaySort(order);
    try {
      localStorage.setItem("pursuit-day-sort", order);
    } catch {}
  }
  function signIn() {
    const native = (
      window as Window & {
        webkit?: {
          messageHandlers?: {
            connectPursuit?: { postMessage: (value: string) => void };
          };
        };
      }
    ).webkit?.messageHandlers?.connectPursuit;
    setSignInMessage("Opening the Pursuit sign-in window…");
    if (native) native.postMessage("connect");
    else
      void action("/api/auth/open")
        .then((result) => setSignInMessage(result.message))
        .catch((error) => setSignInMessage(error.message));
  }
  function refreshDay() {
    return perform(
      () => action(`/api/day/refresh?date=${date}`),
      "Refreshing saved curriculum. Study notes are preserved.",
    );
  }
  const labels: [Tab, string][] = [
    ["assignments", "Assignments"],
    ["notes", "Study notes"],
    ["runs", "Run history"],
    ["resources", "Resources"],
    ["deliverables", "Deliverables"],
    ["obsidian", "Obsidian"],
    ["review", "Review"],
    ["map", "Concept map"],
    ["weekly", "Weekly recap"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="companion-wordmark">
            <span className="pursuit-word">Pursuit</span>
            <span className="companion-name">Study Companion</span>
            <small>Your personal learning dashboard</small>
          </span>
        </a>
        <div className="sidebar-kicker">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="2"
              width="4"
              height="4"
              rx="1"
              stroke="currentColor"
            />
            <rect
              x="10"
              y="2"
              width="4"
              height="4"
              rx="1"
              stroke="currentColor"
            />
            <rect
              x="2"
              y="10"
              width="4"
              height="4"
              rx="1"
              stroke="currentColor"
            />
            <rect
              x="10"
              y="10"
              width="4"
              height="4"
              rx="1"
              stroke="currentColor"
            />
          </svg>
          Learning dashboard
        </div>
        <button
          className={`day-link ${viewingToday ? "selected" : ""}`}
          disabled={!status?.today}
          aria-current={viewingToday ? "page" : undefined}
          onClick={() => {
            setFollowToday(true);
            if (status?.today) setDate(status.today);
            setTab("assignments");
            setLesson(null);
            setTargetTask(null);
            setTargetLine(null);
            window.history.replaceState(null, "", "/");
          }}
        >
          <span>
            Today<small>Assignments & study notes</small>
          </span>
        </button>
        <div className="sidebar-heading">
          YOUR DAYS <span>{status?.days.length ?? 0}</span>
        </div>
        <select
          className="day-sort"
          aria-label="Sort saved days"
          value={daySort}
          onChange={(event) => changeDaySort(event.target.value as DaySort)}
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        <nav aria-label="Saved learning days">
          {sequenceDays(status?.days ?? [], daySort).map((entry) => (
            <button
              key={entry.date}
              className={`day-link ${entry.date === date ? "selected" : ""}`}
              onClick={() => {
                setFollowToday(false);
                setDate(entry.date);
                setLesson(null);
                setTargetTask(null);
                setTargetLine(null);
                window.history.replaceState(null, "", `/?date=${entry.date}`);
              }}
              aria-current={entry.date === date ? "date" : undefined}
            >
              <span>
                {dateLabel(entry.date)}
                <small>
                  {entry.date.slice(0, 4)} ·{" "}
                  {entry.source === "fixture"
                    ? "Offline fixture"
                    : entry.day_id
                      ? `Day ${entry.day_id}`
                      : "Imported history"}
                </small>
              </span>
              <span className="day-count">
                {entry.completed_count ?? 0}/{entry.task_count}
              </span>
            </button>
          ))}
        </nav>
        {!status?.days.length && (
          <p className="sidebar-empty">
            Your days appear here after syncing curriculum.
          </p>
        )}
        <div className="sidebar-footer">
          <span className="dot" />
          Local SQLite history<small>Saved on this device</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>BUILDER DASHBOARD / UNOFFICIAL EDITION</span>
          <div className="topbar-controls">
            <span className="local-badge">
              {busy ? "Run in progress" : "Local workspace"}
            </span>
            <button
              className="settings-button"
              aria-label="Settings"
              title="Settings"
              aria-pressed={tab === "settings"}
              onClick={() => {
                setTargetTask(null);
                setTargetLine(null);
                setLesson(null);
                setTab("settings");
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m9.5 3-.5 2-2 .9-1.9-.6-2.5 4.3L4 11v2l-1.4 1.4 2.5 4.3 1.9-.6 2 .9.5 2h5l.5-2 2-.9 1.9.6 2.5-4.3L20 13v-2l1.4-1.4-2.5-4.3-1.9.6-2-.9-.5-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </header>
        <section
          className={`pursuit-connection ${status?.auth?.state === "VERIFIED" ? "connected" : ["EXPIRED", "REJECTED"].includes(status?.auth?.state ?? "") ? "disconnected" : "unverified"}`}
          aria-label="Pursuit connection"
        >
          <div role="status">
            <strong>
              {status?.auth?.state === "VERIFIED"
                ? "Pursuit connected"
                : status?.auth?.state === "EXPIRED"
                  ? "Token expired"
                  : status?.auth?.state === "REJECTED"
                    ? "Token rejected"
                    : "Pursuit connection"}
            </strong>
            <p>{status?.auth?.message ?? "Checking connection…"}</p>
            {signInMessage && <p>{signInMessage}</p>}
          </div>
          <div className="actions">
            <button disabled={pending || updating} onClick={signIn}>
              Sign in to Pursuit
            </button>
            <button
              disabled={pending || updating}
              onClick={() =>
                void perform(
                  () => action("/api/auth/check"),
                  "Connection checked.",
                )
              }
            >
              Check connection
            </button>
          </div>
        </section>
        <section className="heading">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>
              {viewingToday
                ? "Today"
                : date
                  ? status?.today
                    ? relativeDay(date, new Date(`${status.today}T12:00:00`))
                    : dateLabel(date)
                  : "Your learning, day by day."}
            </h1>
            <p className="subtitle">
              {date
                ? `${dateLabel(date)} · ${date} · Concepts, assignments, and a clear record of your progress.`
                : "Build a lasting record of what you learned and what still needs attention."}
            </p>
          </div>
          <div className="actions">
            <button
              disabled={busy || !settings?.tokenConfigured}
              onClick={() =>
                void perform(
                  () => action("/api/sync"),
                  "Checking saved and missing curriculum days…",
                )
              }
            >
              {status?.catchUp?.running ? "Syncing…" : "Sync with Pursuit"}
            </button>
            <button
              disabled={busy || !settings?.tokenConfigured || !date}
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
              Generate this day’s study report
            </button>
          </div>
        </section>
        {error && (
          <p role="alert" className="study-alert">
            {error}
          </p>
        )}
        {status?.catchUp?.message && (
          <p className="study-notice" role="status">
            {status.catchUp.message}
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
            <strong>
              Version {updates.availableVersion ?? "update"} is available.
            </strong>{" "}
            <span>
              {updates.installedVersion ?? updates.current?.slice(0, 7)} →{" "}
              {updates.availableVersion ?? updates.target?.slice(0, 7)}
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
        <section className="metrics">
          <div>
            <p>ASSIGNMENTS</p>
            <strong>{current?.tasks.length ?? "—"}</strong>
            <small>Recorded for this day</small>
          </div>
          <div>
            <p>PURSUIT COMPLETE</p>
            <strong>
              {current?.tasks.filter((task) => task.completion === 1).length ??
                "—"}
            </strong>
            <small>Reported by Pursuit</small>
          </div>
          <div>
            <p>STUDY MATERIAL</p>
            <strong className="study-material-status">
              {current?.noteContent ? "notes saved" : "—"}
            </strong>
            <small>Markdown learning notes</small>
          </div>
          <div>
            <p>RUN HISTORY</p>
            <strong>{current?.runs.length ?? 0}</strong>
            <small>Saved study runs</small>
          </div>
        </section>
        <div className="assignment-search" role="search">
          <input
            type="search"
            aria-label="Search your assignments"
            placeholder="Search your assignments…"
            maxLength={200}
            value={searchQuery}
            onFocus={() => {
              if (searchQuery.trim()) {
                setTargetTask(null);
                setTargetLine(null);
                setTab("search");
              }
            }}
            onChange={(event) => {
              const query = event.target.value;
              setSearchQuery(query);
              setTargetTask(null);
              setTargetLine(null);
              setTab(query.trim() ? "search" : "assignments");
              setLesson(null);
            }}
          />
        </div>
        <section className="content-panel panel">
          <div
            className="tabs study-tabs"
            role="tablist"
            aria-label="Study tools"
          >
            {labels.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-label={label}
                onClick={() => {
                  setTargetTask(null);
                  setTargetLine(null);
                  setTab(key);
                  setLesson(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "settings" && settings && (
            <div className="panel-body">
              <h2>Connect your own Pursuit account</h2>
              <p>
                Sign in to sync your curriculum. Your connection and study notes
                stay on this device.
              </p>
              <p role="status">
                {status?.auth?.message ?? "Checking Pursuit connection…"}
              </p>
              <button disabled={busy} onClick={signIn}>
                Sign in to Pursuit
              </button>
              {signInMessage && <p role="status">{signInMessage}</p>}
              <h2>App updates</h2>
              <p>
                Installed version: {updates?.installedVersion ?? "Checking…"}
              </p>
              <p>
                Latest published version:{" "}
                {updates?.availableVersion ??
                  (updates?.checkedAt && updates.state === "CURRENT"
                    ? "No published release"
                    : "Checking…")}
              </p>
              <p>{updates?.message ?? "Checking the update source…"}</p>
              <p className="muted">
                Checks when the app starts and every 30 minutes. Updates install
                only when you click Update &amp; restart.
              </p>
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
              <details className="advanced-settings">
                <summary>Advanced setup</summary>
                <p className="muted">
                  Connection settings and manual day imports.
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
                    Pursuit bearer token (optional browser fallback)
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      placeholder={
                        settings.tokenConfigured
                          ? "Leave blank to keep the saved token"
                          : "Leave blank to use native sign-in"
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
                        setSettings({
                          ...settings,
                          timeZone: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Canonical GitHub repository
                    <input
                      type="url"
                      value={settings.upstream}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          upstream: event.target.value,
                        })
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
                  Use a verified day ID and its exact cohort. Imported days
                  appear in the sidebar.
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
              </details>
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
              <div className="section-title assignment-toolbar">
                <h2>Daily assignments</h2>
                {platformDayUrl && (
                  <a
                    className="lesson-link"
                    href={platformDayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open day in Pursuit ↗
                  </a>
                )}
                <span>{current?.tasks.length ?? 0} tasks</span>
              </div>
              <p className="muted">
                Completion reflects Pursuit’s status. It does not verify that an
                external work product exists.
              </p>
              {current?.source === "live" && (
                <button disabled={busy} onClick={() => void refreshDay()}>
                  Fetch this day again
                </button>
              )}
              {current?.tasks.map((task) => (
                <article
                  className="task"
                  key={task.task_id}
                  id={`assignment-${task.task_id}`}
                  tabIndex={-1}
                >
                  <span
                    className={`task-marker ${task.completion === 1 ? "complete" : ""}`}
                  >
                    {task.completion === 1 ? "✓" : "·"}
                  </span>
                  <div className="task-text">
                    <h3>
                      {!task.protected_kind && platformDayUrl ? (
                        <a
                          className="lesson-link"
                          href={platformDayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open this assignment’s day in Pursuit"
                        >
                          {task.title}
                        </a>
                      ) : (
                        task.title
                      )}
                      {!task.protected_kind &&
                        parseTaskAssets(task.assets_json)?.manualRequired && (
                          <DeliverableIcon
                            onClick={() => {
                              setTargetTask(task.task_id);
                              setLesson(null);
                              setTab("deliverables");
                            }}
                          />
                        )}
                      {!task.protected_kind &&
                        parseTaskAssets(task.assets_json)?.resources.map(
                          (link) => (
                            <a
                              key={link.url}
                              className="resource-indicator"
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={link.label}
                            >
                              Resource ↗
                            </a>
                          ),
                        )}
                    </h3>
                    <p>
                      #{task.task_id}
                      {task.classification &&
                        ` · ${label(task.classification)}`}
                    </p>
                    {!task.protected_kind &&
                      current.noteContent &&
                      studyTarget(current.noteContent, task.task_id) && (
                        <button
                          className="study-link-button"
                          onClick={() => {
                            setTargetTask(task.task_id);
                            setTargetLine(null);
                            setLesson(null);
                            setTab("notes");
                            window.history.replaceState(
                              null,
                              "",
                              `/?date=${date}&studyTask=${task.task_id}`,
                            );
                          }}
                        >
                          view study notes
                        </button>
                      )}
                    {!task.protected_kind &&
                      (task.content || task.concept_ids) && (
                        <details>
                          <summary>Lesson source & concepts</summary>
                          {task.concept_ids && (
                            <p>
                              Concepts:{" "}
                              {JSON.parse(task.concept_ids).join(", ") ||
                                "None indexed"}
                            </p>
                          )}
                          {task.content && (
                            <p style={{ whiteSpace: "pre-wrap" }}>
                              {task.content}
                            </p>
                          )}
                        </details>
                      )}
                    {!task.protected_kind &&
                      parseTaskAssets(task.assets_json) && (
                        <TaskAssetDetails
                          assets={parseTaskAssets(task.assets_json)!}
                        />
                      )}
                  </div>
                  <div className="badges">
                    <span
                      className={`badge ${task.completion === 1 ? "blue" : ""}`}
                    >
                      {task.completion === 1
                        ? "Complete"
                        : task.completion === 0
                          ? "Incomplete"
                          : "Unknown"}
                    </span>
                  </div>
                </article>
              ))}
              {!current?.tasks.length && (
                <div className="empty">
                  <span>▤</span>
                  <h3>
                    {status
                      ? "No assignments recorded yet"
                      : "Loading your history…"}
                  </h3>
                  <p>
                    {viewingToday
                      ? "Today’s curriculum hasn’t been loaded yet. Sync with Pursuit or generate a study report to fetch it and see assignment status here."
                      : "No saved curriculum is available for this day."}
                  </p>
                </div>
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
                  <div className="section-title study-toolbar">
                    <div>
                      <h2>Daily learning</h2>
                      {current.source === "live" && (
                        <p className="muted study-source-label">
                          Saved lesson sources · {dateLabel(date)}
                        </p>
                      )}
                    </div>
                    <div className="study-toolbar-actions">
                      {current.source === "live" && (
                        <button
                          disabled={busy || !current.day_id}
                          onClick={() => void refreshDay()}
                        >
                          Fetch this day again
                        </button>
                      )}
                      <button
                        onClick={() =>
                          void perform(
                            () =>
                              copy(
                                withStudyAdditions(
                                  current.noteContent!,
                                  current.studyAdditions ?? [],
                                ),
                              ),
                            "Markdown copied.",
                          )
                        }
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          aria-hidden="true"
                        >
                          <rect x="8" y="8" width="12" height="12" rx="2" />
                          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                        </svg>
                        {copied ? "Copied" : "Copy Markdown"}
                      </button>
                    </div>
                  </div>
                  <article className="markdown">
                    {studySections(current.noteContent).map((section) => (
                      <section key={`${date}-${section.key}`}>
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
                            h3: ({ node, children }) => {
                              const id = assignmentAtHeading(
                                current.noteContent!,
                                node?.position?.start.line ?? 0,
                              );
                              const task = current.tasks.find(
                                (t) => t.task_id === id && !t.protected_kind,
                              );
                              return (
                                <h3
                                  id={`study-heading-${node?.position?.start.line}`}
                                  tabIndex={-1}
                                >
                                  {task ? (
                                    <a
                                      className="lesson-link"
                                      href={`/?date=${date}&assignment=${task.task_id}`}
                                      onClick={(event) => {
                                        if (
                                          event.metaKey ||
                                          event.ctrlKey ||
                                          event.shiftKey ||
                                          event.altKey ||
                                          event.button !== 0
                                        )
                                          return;
                                        event.preventDefault();
                                        navigate(date, task.task_id);
                                      }}
                                    >
                                      {children}
                                    </a>
                                  ) : (
                                    children
                                  )}
                                </h3>
                              );
                            },
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
                          {"\n".repeat(section.line - 1) + section.text}
                        </ReactMarkdown>
                        {section.taskIds.length > 0 &&
                          section.taskIds.every((id) =>
                            current.tasks.some(
                              (task) =>
                                task.task_id === id && !task.protected_kind,
                            ),
                          ) && (
                            <StudyExpansion
                              key={`${date}-${section.key}`}
                              date={date}
                              section={section.key}
                              onSaved={(items) =>
                                setDay((previous) =>
                                  previous?.date === date
                                    ? { ...previous, studyAdditions: items }
                                    : previous,
                                )
                              }
                              initial={(current.studyAdditions ?? []).filter(
                                (item) => item.section === section.key,
                              )}
                            />
                          )}
                      </section>
                    ))}
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
              query={searchQuery}
              date={date || status?.today || ""}
              navigate={navigate}
              copyRecap={(text) => copy(text)}
              recapCopied={copied}
            />
          )}
          {(tab === "resources" || tab === "deliverables") && (
            <Resources
              key={tab}
              view={tab}
              date={date}
              navigate={navigate}
              taskId={targetTask}
            />
          )}
          {tab === "obsidian" && <Obsidian date={date} />}
          {tab === "runs" && (
            <div className="panel-body">
              <div className="section-title">
                <h2>Run history</h2>
                <span>Persistent study records</span>
              </div>
              {runs.map((run) => (
                <details className="run" key={run.id}>
                  <summary>
                    <div>
                      <strong>Study report</strong>
                      <small>
                        {new Date(run.started_at).toLocaleString()}
                        {run.source ? ` · ${run.source}` : ""}
                      </small>
                    </div>
                    <span className="badge">{label(run.status)}</span>
                  </summary>
                  {!run.finished_at && (
                    <p className="muted">
                      No finish was recorded. This run may be active or
                      interrupted; inspect its status before retrying.
                    </p>
                  )}
                  {run.output && (
                    <>
                      <button
                        onClick={() =>
                          void perform(
                            () => copy(run.output!),
                            "Report copied.",
                          )
                        }
                      >
                        {copied ? "Copied" : "Copy report"}
                      </button>
                      <pre>{run.output}</pre>
                    </>
                  )}
                </details>
              ))}
              {!runs.length && (
                <div className="empty">
                  <h3>No runs recorded</h3>
                  <p>New study runs will be saved here.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
