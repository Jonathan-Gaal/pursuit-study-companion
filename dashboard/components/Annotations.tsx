"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

type Annotation = { date: string; text: string; revision: number };
export default function Annotations({ date }: { date: string }) {
  const [entry, setEntry] = useState<Annotation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [latest, setLatest] = useState<Annotation | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setDirty(false);
    setMessage("");
    setLatest(null);
    void fetch(`/api/annotations?date=${date}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load annotations.");
        const saved = (await response.json()) as Annotation;
        if (cancelled) return;
        try {
          const raw = localStorage.getItem(`pursuit-annotation-draft-${date}`);
          if (raw) {
            const draft = JSON.parse(raw) as Annotation;
            if (
              draft.date === date &&
              typeof draft.text === "string" &&
              Number.isSafeInteger(draft.revision)
            ) {
              setEntry(draft);
              setDirty(true);
              setMessage("Recovered your unsaved annotation.");
              return;
            }
          }
        } catch {
          /* storage is optional */
        }
        setEntry(saved);
      })
      .catch(() => {
        if (!cancelled)
          setMessage("Could not load annotations. Switch days to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [date]);
  async function save() {
    if (!entry) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      });
      const saved = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const fresh = await fetch(`/api/annotations?date=${date}`);
          if (fresh.ok) {
            const current = (await fresh.json()) as Annotation;
            if (current.revision !== entry.revision) {
              setLatest(current);
              setMessage(
                "Another edit changed the saved notes. Your draft is preserved. Review and merge both versions before saving.",
              );
              return;
            }
          }
        }
        throw new Error("Save failed");
      }
      setEntry(saved);
      setLatest(null);
      setDirty(false);
      setMessage("Personal notes saved.");
      try {
        localStorage.removeItem(`pursuit-annotation-draft-${date}`);
      } catch {
        /* optional */
      }
    } catch {
      setMessage(
        "Save failed. Your draft is preserved; another edit may have changed the saved version. Copy your text before reloading.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="annotations" id="personal-annotations" tabIndex={-1}>
      <div className="section-title">
        <h2>My notes</h2>
        <div className="study-toolbar-actions">
          <button disabled={!entry} onClick={() => setPreview(!preview)}>
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            disabled={!entry || !dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save my notes"}
          </button>
        </div>
      </div>
      <p className="muted">
        Your examples, questions and observations. Saved separately from
        generated study material.
      </p>
      {entry && !preview && (
        <textarea
          aria-label={`Personal notes for ${date}`}
          maxLength={16000}
          value={entry.text}
          disabled={saving}
          placeholder="Add your own examples or questions…"
          onChange={(event) => {
            const next = { ...entry, text: event.target.value };
            setEntry(next);
            setDirty(true);
            setMessage("");
            try {
              localStorage.setItem(
                `pursuit-annotation-draft-${date}`,
                JSON.stringify(next),
              );
            } catch {
              /* optional */
            }
          }}
        />
      )}
      {entry && preview && (
        <article className="markdown">
          <ReactMarkdown
            skipHtml
            components={{
              img: () => null,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {entry.text || "No personal notes yet."}
          </ReactMarkdown>
        </article>
      )}
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      {latest && entry && (
        <div className="notice">
          <details>
            <summary>Latest saved notes</summary>
            <pre>{latest.text || "No saved text."}</pre>
          </details>
          <button
            onClick={() => {
              const merged = {
                date,
                revision: latest.revision,
                text: `${latest.text}\n\n${entry.text}`.trim(),
              };
              setEntry(merged);
              setDirty(true);
              setPreview(false);
              setLatest(null);
              setMessage(
                "Both versions are in your draft. Edit the merged text, then save.",
              );
              try {
                localStorage.setItem(
                  `pursuit-annotation-draft-${date}`,
                  JSON.stringify(merged),
                );
              } catch {
                /* optional */
              }
            }}
          >
            Merge saved notes into my draft
          </button>
        </div>
      )}
    </section>
  );
}
