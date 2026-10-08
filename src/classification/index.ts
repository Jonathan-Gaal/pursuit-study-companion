import type { Task, Classification, TaskClass } from "../types/index.js";
import { manualAssignmentReason } from "../learning/taskAssets.js";
export function classify(task: Task): Classification {
  if (task.protectedKind)
    return {
      classification: "NEEDS_USER",
      reason: `${task.protectedKind === "ASSESSMENT" ? "Assessment" : "Weekly Survey"} — complete manually`,
      extractLearning: false,
      requiresUser: true,
      futureResponseCandidate: false,
      externalArtifact: false,
    };
  if (task.completionReadFailed)
    return {
      classification: "NEEDS_USER",
      reason: "Completion read failed; review task metadata manually",
      extractLearning: false,
      requiresUser: true,
      futureResponseCandidate: false,
      externalArtifact: false,
    };
  const text = task.text.toLowerCase();
  const result = (
    classification: TaskClass,
    reason: string,
    externalArtifact = false,
  ): Classification => ({
    classification,
    reason,
    extractLearning: classification !== "IGNORE",
    requiresUser: classification === "DELIVERABLE",
    futureResponseCandidate: false,
    externalArtifact,
  });
  if (task.uncertain)
    return result(
      "DELIVERABLE",
      "Uncertain task metadata requires user review",
      true,
    );
  const manual = manualAssignmentReason(task);
  if (manual) return result("DELIVERABLE", manual, true);
  if (
    task.taskMode === "personalized" &&
    task.deliverableType === "none" &&
    !task.deliverableEvidence
  )
    return result(
      "LEARNING",
      "Personalized concept lesson without a requested deliverable",
    );
  const legwork =
    /\b(conduct|perform|carry out)\b.{0,60}\b(research|interview|observation|experiment|test with users)\b|\b(interview|observe|visit|contact|ask)\b.{0,60}\b(user|customer|participant|teammate|instructor|client)\b|\b(collect|gather|measure)\b.{0,60}\b(feedback|data|results|measurements)\b/i.test(
      text,
    );
  const personalEvidence =
    /feedback report|performance tab|feedback you (got|received)/i.test(text);
  const realWork =
    /\b(read|review)\b.{0,100}\b(your|personal|performance|feedback)\b.{0,80}\breport\b|\b(each pair|your pair|with your pair)\b.{0,100}\b(brainstorm|choose|pick|fill|create)\b|\b(brainstorm|choose|pick|fill|create)\b.{0,100}\b(each pair|your pair|with your pair)\b/i.test(
      text,
    );
  const artifact =
    /\bloom\b|\b(deployed|deployment|product|application|document|video|repository)\s+(url|link)\b|\b(record|upload|submit|provide|share)\b.{0,80}\b(video|recording|repository|document|url|link|presentation|research results|teammate feedback)\b|\bteam[- ](created|authored)\b|\b(actual|real)\s+(research|feedback|measurement|result)\b|\b(build|deploy|conduct|interview|present|record)\b.{0,60}\b(app|application|product|research|participant|presentation|walkthrough)\b/i.test(
      text,
    );
  const conversational = new Set([
    "text",
    "conversation",
    "reflection",
    "none",
  ]);
  const unknown =
    task.deliverableType !== null && !conversational.has(task.deliverableType);
  const declared =
    task.deliverableEvidence && !conversational.has(task.deliverableType ?? "");
  if (
    personalEvidence ||
    realWork ||
    legwork ||
    artifact ||
    unknown ||
    declared
  )
    return result(
      "DELIVERABLE",
      unknown
        ? `Requires genuine work or unverified deliverable type (${task.deliverableType})`
        : "Requires genuine artifact, action, or externally verifiable evidence",
      true,
    );
  if (
    task.type === "break" ||
    task.type === "lunch" ||
    /^(lunch|break|informational)$/.test(text.trim()) ||
    (/^(lunch|break)$/i.test(task.title) &&
      !/\b(learn|lesson|teach|exercise|practice)\b/.test(text))
  )
    return result(
      "IGNORE",
      "Schedule block with no learning or submission value",
    );
  if (
    /\b(stand[- ]?up|check[- ]?in|reflection|reflect|retro|retrospective|dry[- ]run)\b/.test(
      text,
    )
  )
    return result(
      "ROUTINE",
      "Conversational check-in or reflection; no genuine artifact detected",
    );
  if (
    task.taskMode === "basic" &&
    task.deliverableType === "none" &&
    !task.deliverableEvidence &&
    /kickoff|pair formation/.test(text)
  )
    return result(
      "LEARNING",
      "Curriculum kickoff without a requested work product",
    );
  if (
    /\b(lesson|learn|teach|explain|practice|understand|competency)\b/.test(
      text,
    ) ||
    task.type === "learning"
  )
    return result("LEARNING", "Substantive concept instruction or practice");
  return result("DELIVERABLE", "Unrecognized task intent requires user review");
}
