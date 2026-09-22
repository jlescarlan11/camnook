import { describe, expect, it } from "vitest";

import { kycDateYearsAgo } from "./age";

describe("KYC Manila age dates", () => {
  it.each([
    ["2026-09-21T15:59:59Z", 18, "2008-09-21"],
    ["2026-09-21T16:00:00Z", 18, "2008-09-22"],
    ["2026-12-31T16:00:00Z", 18, "2009-01-01"],
    ["2028-02-29T08:00:00Z", 18, "2010-02-28"],
    ["2020-02-29T08:00:00Z", 120, "1900-02-28"],
    ["2024-02-29T08:00:00Z", 120, "1904-02-29"],
  ])("subtracts %s by %s calendar years", (instant, years, expected) => {
    expect(kycDateYearsAgo(years, new Date(instant))).toBe(expected);
  });
});
