import { describe, expect, it } from "vitest";
import { restoreScheduleSelection, scheduleEditHref } from "./schedule-navigation";

const policy = { allowedWeekdays: [1, 2, 3, 4, 5], approvedTimes: ["09:00"], cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila" as const, version: 2 };
const selection = { pickupDate: "2026-09-14", returnDate: "2026-09-17", handoffTime: "09:00" };
const now = new Date("2026-09-12T00:00:00Z");

describe("editing an existing schedule", () => {
  it("round trips only the selected schedule through the camera link", () => {
    const href = scheduleEditHref("canon-eos-r50", { ...selection });
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/cameras/canon-eos-r50");
    expect(restoreScheduleSelection(Object.fromEntries(url.searchParams), policy, [], now)).toEqual(selection);
    expect([...url.searchParams.keys()]).toEqual(["pickupDate", "returnDate", "handoffTime"]);
  });
  it.each([
    { ...selection, pickupDate: "invalid" },
    { ...selection, pickupDate: [selection.pickupDate] },
    { ...selection, returnDate: "2026-09-13" },
    { ...selection, handoffTime: "17:00" },
    { ...selection, pickupDate: "2026-09-11" },
  ])("does not restore malformed, expired, or incompatible query inputs: %j", params => {
    expect(restoreScheduleSelection(params, policy, [], now)).toBeUndefined();
  });
  it("checks current policy and availability instead of trusting an old link", () => {
    expect(restoreScheduleSelection(selection, { ...policy, enabled: false }, [], now)).toBeUndefined();
    expect(restoreScheduleSelection(selection, policy, [{ startsAt: "2026-09-15T00:00:00Z", endsAt: "2026-09-16T00:00:00Z" }], now)).toBeUndefined();
  });
});
