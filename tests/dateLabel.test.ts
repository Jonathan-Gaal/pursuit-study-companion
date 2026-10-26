import { expect, it } from "vitest";
import { dateLabel } from "../dashboard/lib/dateLabel.js";

it("shows weekday, abbreviated month and day like the personal dashboard", () => {
  expect(dateLabel("2026-10-20")).toBe("Tue, Oct 20");
  expect(dateLabel("2026-07-06")).toBe("Mon, Jul 6");
  expect(dateLabel("2026-01-01")).toBe("Thu, Jan 1");
});
