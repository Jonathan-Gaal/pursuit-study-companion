"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { SavedStudyAddition } from "../../src/learning/studyExpansion";

export default function StudyExpansion({
  date,
  section,
  initial,
  onSaved,
}: {
  date: string;
  section: string;
  initial: SavedStudyAddition[];
  onSaved: (items: SavedStudyAddition[]) => void;
}) {
  const [additions, setAdditions] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function expand() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/study/expand?date=${encodeURIComponent(date)}&section=${encodeURIComponent(section)}`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not expand these notes.");
      onSaved(data.studyAdditions);
      setAdditions(
        data.studyAdditions.filter(
          (item: SavedStudyAddition) => item.section === section,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not expand these notes.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="study-expansion">
      {additions.map((item, i) => (
        <section key={item.createdAt} className="study-addition">
          <p className="muted">
            More detail · {i + 1} · AI-generated study notes
          </p>
          <ReactMarkdown
            skipHtml
            components={{
              img: () => null,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {item.markdown}
          </ReactMarkdown>
        </section>
      ))}
      <button
        onClick={() => void expand()}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Adding more detail…" : "Tell me more"}
      </button>
      <p className="muted">
        Builds on this day’s notes and earlier expansions.
      </p>
      {error && <p role="alert">{error}</p>}
      <span role="status" className="muted">
        {loading ? "Reading existing notes and generating new detail…" : ""}
      </span>
    </div>
  );
}
