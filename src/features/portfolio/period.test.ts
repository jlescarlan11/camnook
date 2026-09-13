import { describe, expect, it } from "vitest";

import {
  defaultPortfolioPeriod,
  resolvePortfolioPeriod,
} from "./period";

describe("portfolio report periods", () => {
  it("defaults to the current Manila month through tomorrow, end exclusive", () => {
    expect(defaultPortfolioPeriod(new Date("2026-08-16T16:30:00Z"))).toEqual({
      endDateExclusive: "2026-08-18",
      startDate: "2026-08-01",
    });
  });

  it("accepts a valid half-open date range", () => {
    expect(
      resolvePortfolioPeriod({ end: "2026-11-23", start: "2026-11-09" }),
    ).toEqual({
      period: { endDateExclusive: "2026-11-23", startDate: "2026-11-09" },
      status: "valid",
    });
  });

  it("rejects empty, reversed, malformed, and impossible periods", () => {
    for (const params of [
      { end: "2026-11-09", start: "2026-11-09" },
      { end: "2026-11-08", start: "2026-11-09" },
      { end: "2026-11-23", start: "not-a-date" },
      { end: "2026-02-30", start: "2026-02-01" },
    ]) {
      expect(
        resolvePortfolioPeriod(params, new Date("2026-08-16T00:00:00Z"))
          .status,
      ).toBe("invalid");
    }
  });
  it("retains a reversed range for correction without loading a fallback report", () => {
    expect(resolvePortfolioPeriod({ start: "2026-09-20", end: "2026-09-19" })).toEqual({
      status: "invalid", period: { startDate: "2026-09-20", endDateExclusive: "2026-09-19" },
    });
  });

  it("keeps the valid endpoint and clears only malformed or missing dates", () => {
    expect(resolvePortfolioPeriod({ start: "2026-09-20", end: "not-a-date" })).toEqual({
      status: "invalid", period: { startDate: "2026-09-20", endDateExclusive: "" },
    });
    expect(resolvePortfolioPeriod({ end: "2026-09-21" })).toEqual({
      status: "invalid", period: { startDate: "", endDateExclusive: "2026-09-21" },
    });
  });

});
