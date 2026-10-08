/** Locate saved notes without rewriting them; prefer a sourced concept deep dive. */
export function assignmentAtHeading(
  markdown: string,
  line: number,
): number | null {
  const lines = markdown.split("\n");
  if (!/^###\s+/.test(lines[line - 1] ?? "")) return null;
  const next = lines.slice(line).find((value) => value.trim().length > 0);
  const match = /^Task ([1-9]\d*)\.?\s*$/.exec(next ?? "");
  return match && Number.isSafeInteger(Number(match[1]))
    ? Number(match[1])
    : null;
}

export function studyTarget(markdown: string, taskId: number): string | null {
  let heading: number | undefined;
  let concept: number | undefined;
  let assignment: number | undefined;
  let source = false;
  let fence: string | undefined;
  const reference = new RegExp(`\\bTask ${taskId}(?!\\d)`);
  for (const [index, line] of markdown.split("\n").entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined;
      continue;
    }
    if (fence) continue;
    const title = /^(#{1,6})\s+(.+)$/.exec(line);
    if (title) {
      heading = index + 1;
      if (title[1] === "##") concept = heading;
      source = title[2]?.trim() === "Pursuit Source";
    }
    if (reference.test(line)) {
      if (source && concept) return `study-heading-${concept}`;
      if (assignment === undefined && /^Task \d+\.?\s*$/.test(line))
        assignment = heading;
    }
  }
  return assignment ? `study-heading-${assignment}` : null;
}
