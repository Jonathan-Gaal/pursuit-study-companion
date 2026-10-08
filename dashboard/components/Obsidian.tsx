"use client";
import { useEffect, useState } from "react";
import type { obsidianExport } from "../../src/learning/obsidian";
type Preview = Awaited<ReturnType<typeof obsidianExport>>;
export default function Obsidian({ date }: { date: string }) {
  const [scope, setScope] = useState("all");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/obsidian${scope === "selected" ? `?date=${date}` : ""}`;
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError("");
    setPath("");
    setCopied(false);
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setPreview(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not preview saved notes.");
      });
    return () => controller.abort();
  }, [endpoint]);
  async function prepare() {
    setPending(true);
    setError("");
    setPath("");
    setCopied(false);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPath(result.path);
    } catch {
      setError(
        "Could not prepare the export. Your study notes were preserved.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="panel-body">
      <div className="section-title">
        <h2>Obsidian export</h2>
        <span className="badge">Not connected</span>
      </div>
      <p className="muted">
        Your notes are ready for Obsidian whenever you are. Preview them here or
        prepare a ZIP on this computer. No vault connection or automatic sync is
        enabled.
      </p>
      <div className="resource-filters">
        <label>
          Export
          <select
            disabled={pending}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">All saved study notes</option>
            <option value="selected">Selected day · {date}</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <p>
            {preview.noteCount} daily notes · Markdown properties, personal
            annotations, and a linked index
          </p>
          <button
            disabled={pending || !preview.noteCount}
            onClick={() => void prepare()}
          >
            {pending ? "Preparing…" : "Prepare Obsidian ZIP"}
          </button>
          {preview.warnings.map((warning) => (
            <p className="muted" key={warning}>
              {warning}
            </p>
          ))}
          <details className="deliverable-expectations">
            <summary>Preview export files</summary>
            <ul>
              {preview.files.map((file) => (
                <li key={file.path}>
                  <details>
                    <summary>{file.path}</summary>
                    <pre className="obsidian-preview">{file.content}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {path && (
        <div className="task-assets" role="status">
          <p>ZIP prepared locally. Your vault has not been changed.</p>
          <p className="export-path">{path}</p>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(path)
                .then(() => setCopied(true))
                .catch(() =>
                  setError(
                    "Could not copy the path; select it above to copy manually.",
                  ),
                );
            }}
          >
            {copied ? "Copied" : "Copy ZIP path"}
          </button>
          <p className="muted">
            When ready, open this path in Finder, extract the ZIP, and copy its
            Pursuit folder into your vault. Keep your own edits separate before
            importing again.
          </p>
        </div>
      )}
    </div>
  );
}
