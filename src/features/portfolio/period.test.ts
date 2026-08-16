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
});
