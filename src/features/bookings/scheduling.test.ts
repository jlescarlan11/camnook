import { describe, expect, it } from "vitest";
import { canScheduleRental } from "./scheduling";
import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";

const policy = { allowedWeekdays: [1], approvedTimes: ["09:00"], cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila" as const, version: 1 };

describe("catalog scheduling eligibility", () => {
  it("offers date selection for an admitted camera with a usable schedule", () => {
    expect(canScheduleRental(policy, true)).toBe(true);
  });
  it.each([
    ["requests paused", policy, false],
    ["policy missing", null, true],
    ["policy disabled", { ...policy, enabled: false }, true],
    ["no handoff weekdays", { ...policy, allowedWeekdays: [] }, true],
    ["no handoff times", { ...policy, approvedTimes: [] }, true],
  ] satisfies [string, PublicHandoffPolicy | null, boolean][])("does not offer date selection when %s", (_reason, handoff, requestable) => {
    expect(canScheduleRental(handoff, requestable)).toBe(false);
  });
});
