"use client";
import { useEffect, useState } from "react";
import type { ResourceEntry } from "../../src/history/resources";
import TaskAssetDetails, { DeliverableIcon } from "./TaskAssets";

export default function Resources({
  date,
  navigate,
  taskId,
  view,
}: {
  date: string;
  navigate: (date: string, taskId?: number) => void;
  taskId?: number | null;
  view: "resources" | "deliverables";
}) {
  const [entries, setEntries] = useState<ResourceEntry[]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch("/api/resources", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Load failed");
        const data = await response.json();
        if (!controller.signal.aborted) setEntries(data.entries);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load the saved list. Try Refresh.");
      });
    return () => controller.abort();
  }, [revision, date]);
  useEffect(() => {
    if (!taskId) return;
    setScope("selected");
    setQuery("");
  }, [taskId, date]);
  useEffect(() => {
    if (!taskId || scope !== "selected" || query) return;
    const element = document.getElementById(`resource-${date}-${taskId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }, [taskId, date, entries, scope, view, query]);
  const filtered = entries.filter(
    (entry) =>
      (scope === "all" || entry.date === date) &&
      (view !== "deliverables" || entry.assets.manualRequired) &&
      (view !== "resources" || entry.assets.resources.length > 0) &&
      `${entry.title} ${entry.date} ${entry.assets.requirements.join(" ")} ${entry.assets.resources.map((link) => link.label).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const uniqueResources = new Set(
    filtered.flatMap((entry) => entry.assets.resources.map((link) => link.url)),
  ).size;
  return (
    <div className="panel-body resources-panel">
      <div className="section-title">
        <h2>{view === "resources" ? "Resources" : "Deliverables"}</h2>
        <button onClick={() => setRevision((value) => value + 1)}>
          Refresh saved list
        </button>
      </div>
      <p className="muted">
        {view === "resources"
          ? "Assignment reading, reference links, and learning materials across saved days. Open a link to view or download it."
          : "Manual assignments, submission links, and work expectations across saved days."}
      </p>
      <div className="resource-filters">
        <label>
          Days
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">All saved days</option>
            <option value="selected">Selected day · {date}</option>
          </select>
        </label>
        <label>
          Find
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles or expectations"
          />
        </label>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="muted">
        {view === "resources"
          ? `${uniqueResources} resource links`
          : `${filtered.length} manual deliverables`}
      </p>
      {filtered.map((entry) => (
        <article
          className="resource-entry"
          id={`resource-${entry.date}-${entry.taskId}`}
          tabIndex={-1}
          key={`${entry.date}-${entry.taskId}`}
        >
          <div className="section-title">
            <h3>
              <button
                className="resource-title"
                onClick={() => navigate(entry.date, entry.taskId)}
              >
                {entry.title}
              </button>
              {view === "deliverables" && <DeliverableIcon />}
            </h3>
            <small>{entry.date}</small>
          </div>
          <p className="muted">
            {entry.completion === true
              ? view === "deliverables"
                ? "Pursuit reports complete. This does not verify the actual deliverable."
                : "Pursuit reports complete."
              : entry.completion === false
                ? "Pursuit reports incomplete."
                : "Completion is unknown."}
          </p>
          <TaskAssetDetails assets={entry.assets} section={view} />
        </article>
      ))}
      {!filtered.length && (
        <div className="empty">
          <h3>No matching {view} saved</h3>
          <p>
            Fetch a saved day again to retrieve its full curriculum details.
          </p>
        </div>
      )}
    </div>
  );
}
