import { expect, it } from "vitest";
import { pursuitDayUrl } from "../dashboard/lib/pursuitLink.js";

it("opens the selected saved live day using the verified platform route", () => {
  expect(
    pursuitDayUrl({
      source: "live",
      day_id: 1646,
      tasks: [{ cohort: "L2 - September 2026" }],
    }),
  ).toBe(
    "https://platform.pursuit.org/learning?dayId=1646&cohort=L2+-+September+2026",
  );
  const historical = pursuitDayUrl({
    source: "live",
    day_id: 1626,
    tasks: [{ cohort: "L2 - September 2026" }],
  });
  expect(new URL(historical!).searchParams.get("dayId")).toBe("1626");
});

it("does not guess missing or conflicting identities or link fixture days", () => {
  for (const day of [
    { source: "fixture", day_id: 1646, tasks: [{ cohort: "test" }] },
    { source: "live", day_id: null, tasks: [{ cohort: "test" }] },
    { source: "live", day_id: 1646, tasks: [] },
    {
      source: "live",
      day_id: 1646,
      tasks: [{ cohort: "first" }, { cohort: "second" }],
    },
  ])
    expect(pursuitDayUrl(day)).toBeNull();
});
