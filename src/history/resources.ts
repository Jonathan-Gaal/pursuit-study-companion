import type { HistoryStore } from "./store.js";
import { safeHistoryText } from "./store.js";
import {
  extractTaskAssets,
  parseTaskAssets,
  type TaskAssets,
} from "../learning/taskAssets.js";
import { readLibraryNote } from "../learning/library.js";

export interface ResourceEntry {
  date: string;
  taskId: number;
  title: string;
  completion: boolean | null;
  assets: TaskAssets;
  updatedAt: string;
}
export const savedAssets = parseTaskAssets;
export function resourcesOverview(history: HistoryStore) {
  const entries: ResourceEntry[] = [];
  for (const row of history.assetEntries()) {
    const assets = savedAssets(row.snapshot);
    if (
      !assets ||
      (!assets.resources.length &&
        !assets.submissionLinks.length &&
        !assets.requirements.length)
    )
      continue;
    entries.push({
      date: String(row.date),
      taskId: Number(row.task_id),
      title: String(row.title),
      completion: row.completion === null ? null : row.completion === 1,
      assets,
      updatedAt: String(row.updated_at),
    });
  }
  return { entries };
}

/** Recover only saved ordinary curriculum; never treat a generated deep dive as task evidence. */
export async function backfillSavedResources(
  root: string,
  history: HistoryStore,
) {
  const warnings: string[] = [];
  let indexedTasks = 0;
  for (const row of history.listDays().slice(0, 365)) {
    const date = String(row.date),
      day = history.day(date)!;
    let note: string | null = null;
    try {
      note = await readLibraryNote(root, date);
    } catch {
      warnings.push(`${date}: saved notes need review.`);
    }
    const matches =
      note && !/Source: sanitized synthetic Pursuit fixture/.test(note)
        ? [...note.matchAll(/^### ([^\n]+)\n\s*\nTask ([1-9]\d*)\.?\s*$/gm)]
        : [];
    for (const task of day.tasks) {
      if (task.protected_kind) continue;
      const current = savedAssets(task.assets_json);
      if (current?.provenance === "live-metadata") continue;
      const matchIndex = matches.findIndex(
        (match) => Number(match[2]) === Number(task.task_id),
      );
      const match = matches[matchIndex];
      let text = String(task.content ?? "");
      if (!text && match && note) {
        const end =
          matches[matchIndex + 1]?.index ??
          note.indexOf("\n## Common Threads", match.index);
        text = note
          .slice(
            match.index! + match[0].length,
            end !== undefined && end >= 0 ? end : note.length,
          )
          .split("#### Further reading")[0]!;
      }
      const assets = extractTaskAssets({
        text,
        protectedKind: null,
        deliverableType: null,
      });
      if (current) {
        const links = (
          a: typeof assets.resources,
          b: typeof assets.resources,
        ) => [
          ...new Map([...a, ...b].map((item) => [item.url, item])).values(),
        ];
        assets.resources = links(current.resources, assets.resources);
        assets.submissionLinks = links(
          current.submissionLinks,
          assets.submissionLinks,
        );
        assets.requirements = [
          ...new Set([...current.requirements, ...assets.requirements]),
        ];
        assets.manualRequired ||= current.manualRequired;
      }
      history.recordTaskAssets(date, Number(task.task_id), assets);
      if (match && /^Task \d+$/.test(String(task.title)))
        history.updateRecoveredTitle(
          date,
          Number(task.task_id),
          safeHistoryText(match[1]!),
        );
      indexedTasks++;
    }
  }
  return { indexedTasks, warnings };
}
