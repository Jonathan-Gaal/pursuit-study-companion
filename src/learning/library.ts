import { open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { HistoryStore, safeHistoryText } from "../history/store.js";
import { conceptRules } from "./concepts.js";
import { validDate } from "../pursuit/parser.js";

export interface SearchEntry {
  date: string;
  title: string;
  kind: "lesson" | "notes" | "annotation";
  text: string;
  taskId?: number;
  line?: number;
}
export interface ReviewCard {
  id: string;
  date: string;
  concept: string;
  question: string;
  answer: string;
  line: number;
  dueAt: string | null;
  rating: string | null;
}
export interface ConceptNode {
  id: string;
  name: string;
  lessons: { date: string; taskId: number; title: string }[];
}
export interface ConceptEdge {
  from: string;
  to: string;
  count: number;
}

/** Bounded, offline reads. Notes remain ordinary user-inspectable Markdown. */
export async function readLibraryNote(
  root: string,
  date: string,
): Promise<string | null> {
  if (!validDate(date)) throw new Error("Invalid date");
  let file;
  try {
    const directory = await lstat(resolve(root, "study-notes"));
    if (!directory.isDirectory() || directory.isSymbolicLink())
      throw new Error("Unsafe note directory");
    file = await open(
      resolve(root, `study-notes/${date}.md`),
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    const stat = await file.stat();
    if (!stat.isFile() || !stat.size || stat.size > 2 * 1024 * 1024)
      throw new Error("Unsafe note");
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 2 * 1024 * 1024) throw new Error("Oversized note");
    return safeHistoryText(buffer.subarray(0, size).toString("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally {
    await file?.close();
  }
}

export function weekRange(date: string) {
  if (!validDate(date)) throw new Error("Invalid week date");
  const monday = new Date(`${date}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const end = new Date(monday);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function sections(markdown: string) {
  const result: { title: string; level: number; line: number; body: string }[] =
    [];
  let current: (typeof result)[number] | undefined;
  let fence: string | undefined;
  for (const [index, line] of markdown.split("\n").entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined;
    }
    const heading = !fence && /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      current = {
        title: heading[2]!,
        level: heading[1]!.length,
        line: index + 1,
        body: "",
      };
      result.push(current);
    } else if (current) current.body += line + "\n";
  }
  return result;
}

export async function buildLibrary(
  root: string,
  history: HistoryStore,
  week: string,
  query = "",
  now = new Date(),
) {
  const range = weekRange(week);
  const entries: SearchEntry[] = [];
  const cards: ReviewCard[] = [];
  const nodes = new Map<string, ConceptNode>();
  const edges = new Map<string, ConceptEdge>();
  const warnings: string[] = [];
  const reviews = new Map(
    history.reviews().map((row) => [String(row.card_id), row]),
  );
  const days = history.listDays().slice(0, 365);
  const weekly = {
    ...range,
    days: 0,
    notes: 0,
    completed: 0,
    incomplete: 0,
    unknown: 0,
    manual: 0,
    concepts: [] as ConceptNode[],
    revisit: [] as { concept: string; date: string; rating: string }[],
  };
  let bytes = 0;
  let indexedDays = 0;
  dayLoop: for (const row of days) {
    const date = String(row.date);
    const day = history.day(date)!;
    indexedDays++;
    const inWeek = date >= range.start && date <= range.end;
    if (inWeek) weekly.days++;
    for (const task of day.tasks) {
      if (task.protected_kind) {
        if (inWeek) weekly.manual++;
        continue;
      }
      if (task.classification === "IGNORE") continue;
      if (inWeek) {
        if (task.completion === 1) weekly.completed++;
        else if (task.completion === 0) weekly.incomplete++;
        else weekly.unknown++;
      }
      const text = String(task.content ?? "").slice(0, 32000);
      bytes += Buffer.byteLength(text);
      if (bytes > 8 * 1024 * 1024) {
        warnings.push(
          "Library indexing reached its size budget; older material was skipped.",
        );
        break dayLoop;
      }
      entries.push({
        date,
        title: String(task.title),
        kind: "lesson",
        taskId: Number(task.task_id),
        text: text.slice(0, 32000),
      });
      let ids: string[] = [];
      try {
        const parsed: unknown = JSON.parse(String(task.concept_ids ?? "[]"));
        if (Array.isArray(parsed))
          ids = parsed
            .filter(
              (id): id is string =>
                typeof id === "string" && /^[a-z][a-z0-9-]{0,100}$/.test(id),
            )
            .slice(0, 12);
      } catch {
        /* older history may not have concept mappings */
      }
      ids = [
        ...new Set([
          ...ids,
          ...conceptRules
            .filter((rule) => rule.pattern.test(text))
            .map((rule) => rule.id),
        ]),
      ].sort();
      for (const id of ids) {
        const node = nodes.get(id) ?? {
          id,
          name:
            conceptRules.find((rule) => rule.id === id)?.name ??
            id.replaceAll("-", " "),
          lessons: [],
        };
        node.lessons.push({
          date,
          taskId: Number(task.task_id),
          title: String(task.title),
        });
        nodes.set(id, node);
      }
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          const key = `${ids[a]}|${ids[b]}`;
          const edge = edges.get(key) ?? {
            from: ids[a]!,
            to: ids[b]!,
            count: 0,
          };
          edge.count++;
          edges.set(key, edge);
        }
    }
    let note: string | null;
    try {
      note = await readLibraryNote(root, date);
    } catch {
      warnings.push(`Saved notes for ${date} need review and were skipped.`);
      continue;
    }
    if (!note) continue;
    bytes += Buffer.byteLength(note);
    if (bytes > 8 * 1024 * 1024) {
      warnings.push(
        "Note indexing reached its size budget; older notes were skipped.",
      );
      break;
    }
    if (inWeek) weekly.notes++;
    const parts = sections(note);
    let concept: (typeof parts)[number] | undefined;
    let answer = "";
    const protectedIds = new Set(
      day.tasks
        .filter((task) => task.protected_kind)
        .map((task) => Number(task.task_id)),
    );
    let protectedBlock = false;
    for (const part of parts) {
      if (part.level <= 2) protectedBlock = false;
      const assignmentId = /^\s*Task ([1-9]\d*)\.?\s*$/m.exec(part.body)?.[1];
      if (assignmentId) protectedBlock = protectedIds.has(Number(assignmentId));
      if (/^(Assessment|Weekly Survey)\b/i.test(part.title))
        protectedBlock = true;
      if (protectedBlock) continue;
      if (part.level === 2) {
        concept = part;
        answer = "";
      }
      entries.push({
        date,
        title: part.title,
        kind: "notes",
        line: part.line,
        text: part.body.slice(0, 32000),
      });
      if (["Core Idea", "What I Should Remember"].includes(part.title))
        answer += part.body.trim() + "\n\n";
      if (
        part.title === "Questions I Should Be Able to Answer" &&
        concept &&
        cards.length < 600
      ) {
        for (const question of part.body
          .split("\n")
          .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
          .filter((line) => line.endsWith("?"))) {
          if (cards.length >= 600) break;
          const id = createHash("sha256")
            .update(`${date}\n${concept.title}\n${question}`)
            .digest("hex");
          if (cards.some((card) => card.id === id)) continue;
          const review = reviews.get(id);
          cards.push({
            id,
            date,
            concept: concept.title,
            question,
            answer:
              answer.trim().slice(0, 6000) ||
              "Use the linked study section to check your reasoning.",
            line: concept.line,
            dueAt: review ? String(review.due_at) : null,
            rating: review ? String(review.rating) : null,
          });
        }
      }
    }
  }
  for (const row of history.annotations())
    entries.push({
      date: String(row.date),
      title: "Personal annotations",
      kind: "annotation",
      text: String(row.text),
    });
  const concepts = [...nodes.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  weekly.concepts = concepts.filter((node) =>
    node.lessons.some(
      (lesson) => lesson.date >= range.start && lesson.date <= range.end,
    ),
  );
  weekly.revisit = cards
    .filter(
      (card) =>
        ["again", "hard"].includes(card.rating ?? "") &&
        card.date >= range.start &&
        card.date <= range.end,
    )
    .map((card) => ({
      concept: card.concept,
      date: card.date,
      rating: card.rating!,
    }));
  const q = query.trim().toLowerCase();
  const search = q
    ? entries
        .filter((entry) =>
          `${entry.title}\n${entry.text}`.toLowerCase().includes(q),
        )
        .slice(0, 80)
        .map(({ text, ...entry }) => {
          const index = Math.max(0, text.toLowerCase().indexOf(q) - 70);
          return { ...entry, snippet: text.slice(index, index + 240) };
        })
    : [];
  return {
    concepts,
    edges: [...edges.values()],
    cards,
    dueCount: cards.filter(
      (card) => !card.dueAt || card.dueAt <= now.toISOString(),
    ).length,
    weekly,
    search,
    warnings,
    indexedDays,
  };
}
