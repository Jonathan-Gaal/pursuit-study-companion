import { it, expect } from "vitest";
import { relativeDay } from "../dashboard/lib/relativeDay.js";

it("labels today, yesterday and older dates using local calendar days", () => {
  const now = new Date(2026, 9, 6, 0, 1);
  expect(relativeDay("2026-10-06", now)).toBe("Today");
  expect(relativeDay("2026-10-05", now)).toBe("Yesterday");
  expect(relativeDay("2026-10-04", now)).toBe("2 days ago");
  expect(relativeDay("2026-09-28", now)).toBe("8 days ago");
  expect(relativeDay("2026-10-07", now)).toBe("Tomorrow");
});
it("changes labels at midnight and handles month, year and daylight-saving boundaries", () => {
  expect(relativeDay("2026-10-05", new Date(2026, 9, 5, 23, 59))).toBe("Today");
  expect(relativeDay("2026-10-05", new Date(2026, 9, 6, 0, 0))).toBe(
    "Yesterday",
  );
  expect(relativeDay("2025-12-31", new Date(2026, 0, 1))).toBe("Yesterday");
  expect(relativeDay("2026-03-07", new Date(2026, 2, 9, 0, 1))).toBe(
    "2 days ago",
  );
  expect(relativeDay("2026-10-31", new Date(2026, 10, 2, 0, 1))).toBe(
    "2 days ago",
  );
});
it("leaves invalid dates as-is", () => {
  expect(relativeDay("2026-02-30", new Date())).toBe("2026-02-30");
  expect(relativeDay("invalid", new Date())).toBe("invalid");
});
