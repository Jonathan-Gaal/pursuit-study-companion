import { expect, it } from "vitest";
import { curriculumDiagnostic } from "../src/pursuit/curriculumDiagnostic.js";
import { ReadOnlyHttpClient } from "../src/pursuit/http.js";
import { CurriculumUnavailableError } from "../src/pursuit/errors.js";

it("shows only calendar and identity metadata and collection shape", () => {
  const result = curriculumDiagnostic({
    day: {
      id: 1602,
      cohort: "L1 - July 2026",
      day_date: "2026-07-06T04:00:00.000Z",
    },
    flattenedTasks: [{ questions: "protected content" }],
    timeBlocks: [],
  });
  expect(result.returnedCohort).toBe("L1 - July 2026");
  expect(result.returnedDate).toBe("2026-07-06");
  expect(result.returnedDayId).toBe(1602);
  expect(result.flattenedTaskCount).toBe(1);
  expect(JSON.stringify(result)).not.toContain("protected content");
});
it("never emits arbitrary response text, keys, credentials or malformed metadata", () => {
  const secret = "synthetic-secret-value";
  const result = curriculumDiagnostic({
    [secret]: secret,
    day: { id: secret, cohort: secret, date: secret },
    flattenedTasks: secret,
    timeBlocks: [{ title: secret }],
    error: secret,
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.returnedDayId).toBeNull();
  expect(result.returnedCohort).toBeNull();
  expect(result.returnedDate).toBeNull();
  expect(curriculumDiagnostic(null).dayType).toBe("undefined");
  expect(
    curriculumDiagnostic({ day: { date: "2026-02-30" } }).returnedDate,
  ).toBeNull();
});

it("distinguishes access denial from a missing curriculum day without leaking server content", async () => {
  for (const status of [403, 404] as const) {
    const client = new ReadOnlyHttpClient(
      { getToken: () => "synthetic-only" },
      async () => new Response("private server diagnostic", { status }),
    );
    try {
      await client.request(
        "GET",
        "/api/curriculum/days/1603/full-details?cohort=L1%20-%20July%202026",
      );
      throw new Error("Expected unavailable response");
    } catch (error) {
      expect(error).toBeInstanceOf(CurriculumUnavailableError);
      expect((error as CurriculumUnavailableError).httpStatus).toBe(status);
      expect((error as CurriculumUnavailableError).code).toBe("NO_DAY");
      expect((error as Error).message).not.toContain(
        "private server diagnostic",
      );
    }
  }
});
