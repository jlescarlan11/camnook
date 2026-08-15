import { describe, expect, it } from "vitest";

import {
  isIsoCalendarDate,
  manilaBusinessDate,
  nextManilaBusinessDate,
} from "./admin-date";

describe("Manila verification business dates", () => {
  it("uses the Manila calendar date across the UTC boundary", () => {
    const instant = new Date("2026-08-15T16:30:00.000Z");
    expect(manilaBusinessDate(instant)).toBe("2026-08-16");
    expect(nextManilaBusinessDate(instant)).toBe("2026-08-17");
  });

  it("rolls the minimum future date across month and year boundaries", () => {
    expect(nextManilaBusinessDate(new Date("2026-12-31T12:00:00.000Z"))).toBe(
      "2027-01-01",
    );
  });

  it("rejects normalized and impossible calendar dates", () => {
    expect(isIsoCalendarDate("2028-02-29")).toBe(true);
    expect(isIsoCalendarDate("2026-02-29")).toBe(false);
    expect(isIsoCalendarDate("2026-02-31")).toBe(false);
    expect(isIsoCalendarDate("08/15/2026")).toBe(false);
  });
});
