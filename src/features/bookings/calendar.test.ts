import { describe, expect, it } from "vitest";

import {
  buildCalendarMonth,
  composeManilaWallClock,
  endpointStatus,
  getManilaToday,
  periodOverlapsAvailability,
  shiftCalendarMonth,
} from "./calendar";

describe("booking calendar", () => {
  it("renders a stable six-week leap-month grid with adjacent days", () => {
    const days = buildCalendarMonth("2028-02");
    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ date: "2028-01-30", inMonth: false });
    expect(days.find((day) => day.date === "2028-02-29")).toMatchObject({
      inMonth: true,
      label: expect.stringContaining("February 29, 2028"),
    });
  });

  it("moves across year boundaries and rejects malformed months", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("2026-13", 1)).toBeNull();
  });

  it("derives today and composes instants independently of device timezone", () => {
    expect(getManilaToday(new Date("2026-08-20T16:30:00Z"))).toBe("2026-08-21");
    expect(composeManilaWallClock("2026-08-25", "09:00")).toBe(
      "2026-08-25T09:00:00+08:00",
    );
    expect(composeManilaWallClock("2026-02-30", "09:00")).toBeNull();
  });

  it("disables closed, no-handoff, unavailable, and non-ordered endpoints", () => {
    const common = {
      allowedWeekdays: [1, 2, 3, 4, 5],
      availability: [
        {
          endsAt: "2026-08-26T12:00:00+08:00",
          startsAt: "2026-08-26T08:00:00+08:00",
        },
      ],
      now: new Date("2026-08-21T02:00:00Z"),
      role: "pickup" as const,
      time: "09:00",
    };
    expect(endpointStatus({ ...common, date: "2026-08-21" }).reason).toBe("closed");
    expect(endpointStatus({ ...common, date: "2026-08-23" }).reason).toBe(
      "no_handoff",
    );
    expect(endpointStatus({ ...common, date: "2026-08-26" }).reason).toBe(
      "unavailable",
    );
    expect(
      endpointStatus({
        ...common,
        date: "2026-08-25",
        role: "return",
        selectedPickup: "2026-08-25",
      }).reason,
    ).toBe("before_pickup");
  });

  it("allows no-handoff interior dates and uses half-open overlap semantics", () => {
    const busy = [
      {
        endsAt: "2026-08-25T09:00:00+08:00",
        startsAt: "2026-08-24T09:00:00+08:00",
      },
    ];
    expect(periodOverlapsAvailability("2026-08-23", "2026-08-24", "09:00", busy)).toBe(
      false,
    );
    expect(periodOverlapsAvailability("2026-08-25", "2026-08-26", "09:00", busy)).toBe(
      false,
    );
    expect(periodOverlapsAvailability("2026-08-23", "2026-08-26", "09:00", busy)).toBe(
      true,
    );
    expect(
      endpointStatus({
        allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        availability: busy,
        date: "2026-08-24",
        now: new Date("2026-08-20T00:00:00Z"),
        role: "return",
        selectedPickup: "2026-08-23",
        time: "09:00",
      }).reason,
    ).toBe("available");
    expect(
      endpointStatus({
        allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        availability: busy,
        date: "2026-08-25",
        now: new Date("2026-08-20T00:00:00Z"),
        role: "pickup",
        time: "09:00",
      }).reason,
    ).toBe("available");
  });

  it("allows a rental range whose interior days have no lender handoff", () => {
    const endpointInput = {
      allowedWeekdays: [1, 2, 3],
      availability: [],
      now: new Date("2026-09-01T00:00:00Z"),
      time: "10:00",
    };

    expect(
      endpointStatus({
        ...endpointInput,
        date: "2026-09-02",
        role: "pickup",
      }),
    ).toEqual({ disabled: false, reason: "available" });
    expect(
      endpointStatus({
        ...endpointInput,
        date: "2026-09-07",
        role: "return",
        selectedPickup: "2026-09-02",
      }),
    ).toEqual({ disabled: false, reason: "available" });
    expect(
      endpointStatus({
        ...endpointInput,
        date: "2026-09-03",
        role: "return",
        selectedPickup: "2026-09-02",
      }).reason,
    ).toBe("no_handoff");
    expect(
      periodOverlapsAvailability(
        "2026-09-02",
        "2026-09-07",
        "10:00",
        [],
      ),
    ).toBe(false);
  });
});
