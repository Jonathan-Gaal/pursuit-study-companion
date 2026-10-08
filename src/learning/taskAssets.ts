import type { Task } from "../types/index.js";

export interface AssignmentLink {
  url: string;
  label: string;
}
export interface TaskAssets {
  resources: AssignmentLink[];
  submissionLinks: AssignmentLink[];
  requirements: string[];
  manualRequired: boolean;
  provenance: "live-metadata" | "saved-curriculum";
}
export const emptyTaskAssets = (): TaskAssets => ({
  resources: [],
  submissionLinks: [],
  requirements: [],
  manualRequired: false,
  provenance: "saved-curriculum",
});

export function safeResourceUrl(value: string): string | null {
  if (value.length > 3000 || /[\r\n\x00]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((key) =>
        /^(?:token|access_token|api[_-]?key|authorization)$/i.test(key),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
const artifact =
  /\b(?:google\s+(?:doc|document|sheet|slide)s?|document|repository|github\s+repo|loom|video|recording|presentation|deployed\s+(?:app|application|url)|working\s+(?:app|application|agent)|research\s+results|viewable\s+link)\b/i;
const work =
  /\b(?:submit|upload|provide|share|create|build|finish|complete|record|deploy|send|deliverable|must|required|expectation)\b/i;
const conversational =
  /\b(?:conversation itself|deliverable (?:is|for this task is) (?:the )?conversation|reflection|reflect on|presentation reflection|feedback report reflection)\b/i;

function links(text: string): AssignmentLink[] {
  const result: AssignmentLink[] = [];
  const labeled = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s<>]+)\)/g;
  for (const match of text.matchAll(labeled)) {
    const url = safeResourceUrl(match[2]!);
    if (url) result.push({ url, label: match[1]! });
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    const url = safeResourceUrl(match[0].replace(/[),.;!?\]}]+$/, ""));
    if (url && !result.some((link) => link.url === url))
      result.push({ url, label: new URL(url).hostname });
  }
  return result;
}

/** Deterministic evidence only: resource links are never manufactured or fetched. */
export function extractTaskAssets(
  task: Pick<Task, "text" | "protectedKind" | "deliverableType">,
  metadata?: Record<string, unknown>[],
): TaskAssets {
  if (task.protectedKind) return emptyTaskAssets();
  const assets = emptyTaskAssets();
  if (metadata) assets.provenance = "live-metadata";
  const resource = new Map<string, AssignmentLink>();
  const submission = new Map<string, AssignmentLink>();
  const requirements = new Set<string>();
  let nodes = 0;
  function addText(
    text: string,
    kind: "resource" | "submission" | "expectation",
    label?: string,
  ) {
    for (const link of links(text)) {
      const target = kind === "submission" ? submission : resource;
      const previous = target.get(link.url);
      target.set(link.url, {
        ...link,
        label:
          label?.slice(0, 300) ||
          (previous && link.label === new URL(link.url).hostname
            ? previous.label
            : link.label),
      });
    }
    if (
      kind === "expectation" &&
      text.trim() &&
      artifact.test(text) &&
      work.test(text) &&
      !conversational.test(text)
    )
      requirements.add(text.trim().slice(0, 2000));
  }
  function visit(
    value: unknown,
    kind: "resource" | "submission" | "expectation",
    depth = 0,
    label?: string,
  ) {
    if (++nodes > 2000 || depth > 8)
      throw new Error("Resource metadata exceeds limits");
    if (typeof value === "string") {
      addText(value, kind, label);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, kind, depth + 1, label);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const name = [record.title, record.name, record.label].find(
        (value) => typeof value === "string",
      ) as string | undefined;
      for (const [key, item] of Object.entries(record))
        visit(
          item,
          /submit|submission/i.test(key) ? "submission" : kind,
          depth + 1,
          name ?? label,
        );
    }
  }
  for (const record of metadata ?? []) {
    for (const [key, value] of Object.entries(record)) {
      if (/submit|submission/i.test(key)) visit(value, "submission");
      else if (/resources|resource_links|linked_resources/i.test(key))
        visit(value, "resource");
      else if (
        /^(deliverable|deliverable_schema|expectations|assignment_expectations|v2_task_intent)$/i.test(
          key,
        )
      )
        visit(value, "expectation");
    }
  }
  const lines = task.text.slice(0, 32000).split(/\n|(?<=[.!?])\s+/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const context = `${lines[index - 1] ?? ""}\n${line}\n${lines[index + 1] ?? ""}`;
    const submit =
      /(?:submit(?:\s+(?:your|here|at|via|link|url))?|submission\s+(?:link|url|form)|upload\s+(?:here|at|via))/i.test(
        context,
      ) && !/submit your (?:message|answer|response)/i.test(context);
    addText(line, submit ? "submission" : "resource");
    if (artifact.test(line) && work.test(line) && !conversational.test(line))
      requirements.add(line.trim().slice(0, 2000));
  }
  const type = task.deliverableType?.toLowerCase();
  if (type && !["none", "text", "conversation", "reflection"].includes(type))
    requirements.add(
      `Pursuit requires a ${type.replaceAll("_", " ")} deliverable.`,
    );
  assets.submissionLinks = [...submission.values()].slice(0, 30);
  assets.resources = [...resource.values()]
    .filter((link) => !submission.has(link.url))
    .slice(0, 30);
  assets.requirements = [...requirements].slice(0, 12);
  assets.manualRequired =
    assets.submissionLinks.length > 0 || assets.requirements.length > 0;
  return assets;
}

export function parseTaskAssets(value: unknown): TaskAssets | null {
  if (typeof value !== "string") return null;
  try {
    const assets = JSON.parse(value) as TaskAssets;
    if (
      !assets ||
      !Array.isArray(assets.resources) ||
      !Array.isArray(assets.submissionLinks) ||
      !Array.isArray(assets.requirements) ||
      typeof assets.manualRequired !== "boolean"
    )
      return null;
    if (
      assets.resources.length > 30 ||
      assets.submissionLinks.length > 30 ||
      assets.requirements.length > 12
    )
      return null;
    for (const link of [...assets.resources, ...assets.submissionLinks])
      if (
        !link ||
        typeof link.label !== "string" ||
        typeof link.url !== "string" ||
        !safeResourceUrl(link.url)
      )
        return null;
    if (assets.requirements.some((text) => typeof text !== "string"))
      return null;
    return assets;
  } catch {
    return null;
  }
}

export function taskAssets(task: Task): TaskAssets {
  const fresh = extractTaskAssets(task);
  if (task.protectedKind) return fresh;
  if (task.completionDetails?.requiresDeliverable === true) {
    fresh.manualRequired = true;
    if (!fresh.requirements.length)
      fresh.requirements.push(
        "Pursuit reports a required deliverable; review the assignment expectations.",
      );
  }
  if (!task.assets) return fresh;
  const merge = (a: AssignmentLink[], b: AssignmentLink[]) =>
    [...new Map([...a, ...b].map((link) => [link.url, link])).values()].slice(
      0,
      30,
    );
  return {
    ...task.assets,
    resources: merge(task.assets.resources, fresh.resources),
    submissionLinks: merge(task.assets.submissionLinks, fresh.submissionLinks),
    requirements: [
      ...new Set([...task.assets.requirements, ...fresh.requirements]),
    ].slice(0, 12),
    manualRequired: task.assets.manualRequired || fresh.manualRequired,
  };
}
export function manualAssignmentReason(task: Task): string | null {
  if (task.protectedKind) return null; // Protected tasks have their own stronger override.
  const assets = taskAssets(task);
  return assets.manualRequired
    ? "Deliverable or submission link requires your own work in Pursuit; automated actions are blocked."
    : null;
}
