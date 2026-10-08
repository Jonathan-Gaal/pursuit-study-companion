import { validDate } from "../pursuit/parser.js";

export function lessonSourceUrl(date: string, taskId: number): string {
  if (!validDate(date) || !Number.isSafeInteger(taskId) || taskId <= 0)
    throw new Error("Invalid lesson reference");
  return `/?date=${date}&lesson=${taskId}`;
}

/** Enrich legacy Markdown in memory; never regenerate or overwrite saved notes. */
export function linkStudySources(
  markdown: string,
  date: string,
  taskIds: number[],
): string {
  const allowed = new Set(taskIds);
  let sourceSection = false;
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length)
          fence = undefined;
        return line;
      }
      if (fence) return line;
      if (/^#{1,6}\s/.test(line))
        sourceSection = /^#{1,6}\s+Pursuit Source\s*$/.test(line);
      if (!sourceSection) return line;
      return line.replace(
        /^(\s*- )?Task (\d+)(?=:|\.?$)/gm,
        (match, bullet: string | undefined, id: string) =>
          allowed.has(Number(id))
            ? `${bullet ?? ""}[Task ${id}](${lessonSourceUrl(date, Number(id))})`
            : match,
      );
    })
    .join("\n");
}
