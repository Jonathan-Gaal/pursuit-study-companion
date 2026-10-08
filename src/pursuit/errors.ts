/** Only fixed, non-sensitive diagnostics are exposed by the live boundary. */
export class CurriculumCohortMismatchError extends Error {
  constructor(readonly returnedCohort: string) {
    super("Curriculum belongs to a different cohort; it was not imported.");
    this.name = "CurriculumCohortMismatchError";
  }
}

export class PursuitReadError extends Error {
  constructor(
    readonly code:
      | "BLOCKED"
      | "CONFIG"
      | "AUTH"
      | "HTTP"
      | "SCHEMA"
      | "LIMIT"
      | "TIMEOUT"
      | "DISCOVERY"
      | "NO_DAY",
  ) {
    const messages = {
      BLOCKED:
        "BLOCKED: only allowlisted GET operations without a request body are permitted.",
      CONFIG:
        "Live read requires PURSUIT_TOKEN in local configuration; do not share the token in chat.",
      AUTH: "Pursuit authentication rejected. Check the local token; it may have expired.",
      HTTP: "Pursuit GET failed. No retry or write was attempted.",
      SCHEMA:
        "Pursuit returned an unexpected response schema; completion is UNKNOWN.",
      LIMIT:
        "Read budget or response-size limit exceeded; remaining reads blocked.",
      TIMEOUT: "Pursuit GET deadline exceeded; remaining reads blocked.",
      DISCOVERY:
        "BLOCKED: configure confirmed PURSUIT_DAY_IDS and PURSUIT_COHORT for exact local-date selection. The bounded preflight found no exact date match.",
      NO_DAY: "Pursuit has not published this curriculum day ID.",
    };
    super(messages[code]);
    this.name = "PursuitReadError";
  }
}

/** Preserve fixed status evidence without exposing raw server error content. */
export class CurriculumUnavailableError extends PursuitReadError {
  constructor(readonly httpStatus: 403 | 404) {
    super("NO_DAY");
    this.message =
      httpStatus === 403
        ? "Curriculum GET returned HTTP 403 (access denied); this does not prove the day is missing."
        : "Curriculum GET returned HTTP 404 (not found).";
  }
}
