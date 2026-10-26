"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { buildLibrary } from "../../src/learning/library";

export type LearningMode = "search" | "review" | "map" | "weekly";
type Library = Awaited<ReturnType<typeof buildLibrary>>;
export default function LearningHub({
  mode,
  query = "",
  date,
  navigate,
  copyRecap,
  recapCopied,
}: {
  mode: LearningMode;
  query?: string;
  date: string;
  navigate: (date: string, taskId?: number, line?: number) => void;
  copyRecap: (text: string) => Promise<void>;
  recapCopied: boolean;
}) {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratingPending, setRatingPending] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        void fetch(
          `/api/library?week=${date}&q=${encodeURIComponent(mode === "search" ? query : "")}`,
          { signal: controller.signal },
        )
          .then(async (response) => {
            if (!response.ok)
              throw new Error("Could not load the learning library.");
            const result = (await response.json()) as Library;
            if (!controller.signal.aborted) setData(result);
          })
          .catch(() => {
            if (!controller.signal.aborted)
              setError("Could not load the library. Try Refresh.");
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      mode === "search" ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, date, query, revision]);
  const due =
    data?.cards.filter(
      (card) => !card.dueAt || card.dueAt <= new Date().toISOString(),
    ) ?? [];
  const card = due[0];
  const concept = data?.concepts.find((node) => node.id === selectedConcept);
  const titles = {
    search: "Search results",
    review: "Review mode",
    map: "Concept map",
    weekly: "Weekly learning recap",
  };
  async function rate(rating: string) {
    if (!card) return;
    setRatingPending(true);
    setError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: card.date, cardId: card.id, rating }),
      });
      if (!response.ok) throw new Error("Review could not be saved.");
      setData((previous) =>
        previous
          ? {
              ...previous,
              cards: previous.cards.filter((value) => value.id !== card.id),
              dueCount: Math.max(0, previous.dueCount - 1),
            }
          : null,
      );
      setRevealed(false);
      setReviewed((count) => count + 1);
    } catch {
      setError(
        "Could not save your review. Try again; the question stays here.",
      );
    } finally {
      setRatingPending(false);
    }
  }
  return (
    <div className="panel-body learning-hub">
      <div className="section-title">
        <h2>{titles[mode]}</h2>
        {mode === "weekly" && data && (
          <button
            onClick={() => {
              const week = data.weekly;
              const text = `# Weekly Learning — ${week.start} to ${week.end}\n\n${week.days} saved days · ${week.notes} study reports · ${week.concepts.length} concepts\n\nPursuit reports ${week.completed} complete, ${week.incomplete} incomplete, ${week.unknown} unknown. ${week.manual} protected tasks remain manual.\n\n## Concepts\n\n${
                week.concepts
                  .map(
                    (node) =>
                      `- ${node.name}: ${node.lessons
                        .filter(
                          (lesson) =>
                            lesson.date >= week.start &&
                            lesson.date <= week.end,
                        )
                        .map((lesson) => `${lesson.date} — ${lesson.title}`)
                        .join("; ")}`,
                  )
                  .join("\n") || "No concepts saved yet."
              }\n\n## Worth revisiting\n\n${week.revisit.map((item) => `- ${item.concept} (${item.rating}, ${item.date})`).join("\n") || "Use Review mode to identify what needs another look."}\n\nCompletion is reported by Pursuit, not proof of mastery or external work.`;
              void copyRecap(text);
            }}
          >
            {recapCopied ? "Copied" : "Copy recap"}
          </button>
        )}
        <button
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh
        </button>
      </div>
      {loading && (
        <p className="muted" role="status">
          Loading saved learning…
        </p>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {data?.warnings.map((warning) => (
        <p className="muted" key={warning}>
          {warning}
        </p>
      ))}
      {mode === "search" && (
        <>
          <p className="muted">
            Assignments, study notes and your notes from{" "}
            {data?.indexedDays ?? 0} saved days.
          </p>
          {data?.search.map((result, index) => (
            <button
              className="search-result"
              key={`${result.date}-${index}`}
              onClick={() =>
                navigate(
                  result.date,
                  result.taskId,
                  result.kind === "annotation" ? 0 : result.line,
                )
              }
            >
              <strong>{result.title}</strong>
              <small>
                {result.date} ·{" "}
                {result.kind === "annotation" ? "My notes" : result.kind}
              </small>
              <p>{result.snippet}</p>
            </button>
          ))}
          {query.trim() && !loading && data && !data.search.length && (
            <p>No matching saved material.</p>
          )}
        </>
      )}
      {mode === "review" && (
        <>
          <p className="muted">
            Practice questions from your study notes. These are independent
            self-tests, separate from Pursuit assessments and surveys.
          </p>
          <p>
            {due.length} questions due · {reviewed} reviewed this session
          </p>
          {card ? (
            <section className="review-card">
              <small>
                {card.concept} · {card.date}
              </small>
              <h3>{card.question}</h3>
              <button onClick={() => navigate(card.date, undefined, card.line)}>
                View study section
              </button>
              {!revealed ? (
                <button className="primary" onClick={() => setRevealed(true)}>
                  Show study guidance
                </button>
              ) : (
                <>
                  <article className="markdown">
                    <ReactMarkdown skipHtml components={{ img: () => null }}>
                      {card.answer}
                    </ReactMarkdown>
                  </article>
                  <p className="muted">
                    Check your explanation against this guidance and the full
                    notes, then rate how well you recalled it.
                  </p>
                  <div className="review-ratings">
                    {["again", "hard", "good", "easy"].map((rating) => (
                      <button
                        disabled={ratingPending}
                        key={rating}
                        onClick={() => void rate(rating)}
                      >
                        {rating === "again"
                          ? "Review tomorrow"
                          : rating[0]!.toUpperCase() + rating.slice(1)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          ) : (
            <div className="empty">
              <h3>
                {data?.cards.length
                  ? "You’re caught up"
                  : "No practice questions saved yet"}
              </h3>
              <p>
                {data?.cards.length
                  ? "Rated concepts will return when they’re due."
                  : "Study sections with self-test questions appear here automatically."}
              </p>
            </div>
          )}
        </>
      )}
      {mode === "map" && (
        <>
          <p className="muted">
            Select a concept to see its lessons across days. Lines connect
            concepts found in the same lesson; they do not imply prerequisites.
          </p>
          {data && data.concepts.length > 0 ? (
            <>
              <svg
                className="concept-map"
                viewBox="0 0 800 500"
                role="img"
                aria-label="Concepts connected by shared lessons"
              >
                {data.edges.map((edge) => {
                  const a = data.concepts.findIndex(
                      (node) => node.id === edge.from,
                    ),
                    b = data.concepts.findIndex((node) => node.id === edge.to);
                  const position = (index: number) => ({
                    x:
                      400 +
                      300 *
                        Math.cos((2 * Math.PI * index) / data.concepts.length),
                    y:
                      250 +
                      185 *
                        Math.sin((2 * Math.PI * index) / data.concepts.length),
                  });
                  const start = position(a),
                    end = position(b);
                  return (
                    <line
                      key={`${edge.from}-${edge.to}`}
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="#d1d1fa"
                      strokeWidth={Math.min(5, 1 + edge.count)}
                    />
                  );
                })}
                {data.concepts.map((node, index) => {
                  const x =
                      400 +
                      300 *
                        Math.cos((2 * Math.PI * index) / data.concepts.length),
                    y =
                      250 +
                      185 *
                        Math.sin((2 * Math.PI * index) / data.concepts.length);
                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={node.name}
                      aria-pressed={selectedConcept === node.id}
                      onClick={() => setSelectedConcept(node.id)}
                      onKeyDown={(event) => {
                        if (["Enter", " "].includes(event.key)) {
                          event.preventDefault();
                          setSelectedConcept(node.id);
                        }
                      }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={selectedConcept === node.id ? 19 : 14}
                        fill="#4242ea"
                      />
                      <text
                        x={x}
                        y={y + 32}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#161923"
                      >
                        {node.name.length > 26
                          ? node.name.slice(0, 24) + "…"
                          : node.name}
                      </text>
                      <title>{node.name}</title>
                    </g>
                  );
                })}
              </svg>
              <div className="concept-chips">
                {data.concepts.map((node) => (
                  <button
                    key={node.id}
                    aria-pressed={selectedConcept === node.id}
                    onClick={() => setSelectedConcept(node.id)}
                  >
                    {node.name} <small>{node.lessons.length}</small>
                  </button>
                ))}
              </div>
              {concept && (
                <section className="concept-detail">
                  <h3>{concept.name}</h3>
                  {concept.lessons.map((lesson) => (
                    <button
                      className="search-result"
                      key={`${lesson.date}-${lesson.taskId}`}
                      onClick={() => navigate(lesson.date, lesson.taskId)}
                    >
                      <strong>{lesson.title}</strong>
                      <small>{lesson.date} · View assignment</small>
                    </button>
                  ))}
                </section>
              )}
            </>
          ) : (
            <p>
              No concepts indexed yet. Generate study notes to build your map.
            </p>
          )}
        </>
      )}
      {mode === "weekly" && data && (
        <>
          <p className="muted">
            {data.weekly.start}–{data.weekly.end} · Week of the selected day
          </p>
          <div className="recap-metrics">
            <div>
              <strong>{data.weekly.days}</strong> saved days
            </div>
            <div>
              <strong>{data.weekly.notes}</strong> study reports
            </div>
            <div>
              <strong>{data.weekly.concepts.length}</strong> concepts
            </div>
            <div>
              <strong>{data.weekly.completed}</strong> Pursuit-complete
              assignments
            </div>
          </div>
          <p>
            {data.weekly.incomplete} incomplete · {data.weekly.unknown} unknown
            completion · {data.weekly.manual} protected tasks left manual
          </p>
          <p className="muted">
            This recap describes saved curriculum and completion observations,
            not proof of mastery or external work.
          </p>
          <h3>What appeared this week</h3>
          {data.weekly.concepts.map((node) => (
            <section className="recap-concept" key={node.id}>
              <h4>{node.name}</h4>
              <p className="muted">
                {
                  node.lessons.filter(
                    (lesson) =>
                      lesson.date >= data.weekly.start &&
                      lesson.date <= data.weekly.end,
                  ).length
                }{" "}
                lessons this week
              </p>
              {node.lessons
                .filter(
                  (lesson) =>
                    lesson.date >= data.weekly.start &&
                    lesson.date <= data.weekly.end,
                )
                .map((lesson) => (
                  <button
                    key={`${lesson.date}-${lesson.taskId}`}
                    onClick={() => navigate(lesson.date, lesson.taskId)}
                  >
                    {lesson.date} · {lesson.title}
                  </button>
                ))}
            </section>
          ))}
          {!data.weekly.concepts.length && (
            <p>No concepts saved for this week yet.</p>
          )}
          <h3>Worth revisiting</h3>
          {data.weekly.revisit.length ? (
            data.weekly.revisit.slice(0, 20).map((item, index) => (
              <p key={index}>
                {item.concept} · rated {item.rating} · {item.date}
              </p>
            ))
          ) : (
            <p className="muted">
              Use Review mode to identify concepts that need another look.
            </p>
          )}
        </>
      )}
    </div>
  );
}
