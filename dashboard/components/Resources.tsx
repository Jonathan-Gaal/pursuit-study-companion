"use client";
import { useEffect, useState } from "react";
import type { ResourceEntry } from "../../src/history/resources";
import TaskAssetDetails, { DeliverableIcon } from "./TaskAssets";

export default function Resources({
  date,
  navigate,
  taskId,
}: {
  date: string;
  navigate: (date: string, taskId?: number) => void;
  taskId?: number | null;
}) {
  const [entries, setEntries] = useState<ResourceEntry[]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [view, setView] = useState("all");
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
          setError("Could not load saved resources. Try Refresh.");
      });
    return () => controller.abort();
  }, [revision, date]);
  useEffect(() => {
    if (!taskId) return;
    setScope("selected");
    setView("all");
    setQuery("");
  }, [taskId, date]);
  useEffect(() => {
    if (!taskId || scope !== "selected" || view !== "all" || query) return;
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
        <h2>Resources & deliverables</h2>
        <button onClick={() => setRevision((value) => value + 1)}>
          Refresh saved list
        </button>
      </div>
      <p className="muted">
        Assignment materials and manual work, across today and previous saved
        days. Open a resource in your browser to view it or use its download
        options.
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
          Show
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="all">Resources & deliverables</option>
            <option value="deliverables">Deliverables only</option>
            <option value="resources">Resources only</option>
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
        {uniqueResources} resource links ·{" "}
        {filtered.filter((entry) => entry.assets.manualRequired).length} manual
        deliverables
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
              {entry.assets.manualRequired && <DeliverableIcon />}
            </h3>
            <small>{entry.date}</small>
          </div>
          <p className="muted">
            {entry.completion === true
              ? "Pursuit reports complete. This does not verify the actual deliverable."
              : entry.completion === false
                ? "Pursuit reports incomplete."
                : "Completion is unknown."}
          </p>
          <TaskAssetDetails assets={entry.assets} />
        </article>
      ))}
      {!filtered.length && (
        <div className="empty">
          <h3>No matching resources or deliverables saved</h3>
          <p>
            Fetch a saved day again to retrieve its full curriculum details.
          </p>
        </div>
      )}
    </div>
  );
}
