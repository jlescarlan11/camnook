import { describe, expect, it } from "vitest";

import {
  formatManilaDateTime,
  formatManilaDateTimeInput,
  normalizeQuoteInputKey,
  parseManilaBookingPeriod,
  parseManilaWallClock,
} from "./manila-time";

describe("Manila rental time", () => {
  it("turns an exact datetime-local value into a UTC+08:00 instant", () => {
    expect(parseManilaWallClock("2026-08-14T09:05")).toEqual({
      instant: "2026-08-14T09:05:00+08:00",
      ok: true,
    });
  });

  it.each(["", "2026-8-14T09:05", "2026-02-30T09:05", "2026-08-14T24:00"])(
    "rejects malformed or impossible Manila wall time %j",
    (value) => {
      expect(parseManilaWallClock(value)).toEqual({ ok: false });
    },
  );

  it("rejects missing, past, equal, and reversed booking periods with field errors", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");

    expect(parseManilaBookingPeriod("", "", now)).toMatchObject({
      fieldErrors: {
        pickup: "Enter a pickup date and time.",
        return: "Enter a return date and time.",
      },
      ok: false,
    });
    expect(
      parseManilaBookingPeriod("2026-08-14T07:00", "2026-08-14T09:00", now),
    ).toMatchObject({
      fieldErrors: { pickup: "Pickup must be in the future." },
      ok: false,
    });
    expect(
      parseManilaBookingPeriod("2026-08-14T09:00", "2026-08-14T09:00", now),
    ).toMatchObject({
      fieldErrors: { return: "Return must be after pickup." },
      ok: false,
    });
    expect(
      parseManilaBookingPeriod("2026-08-15T09:00", "2026-08-14T09:00", now),
    ).toMatchObject({
      fieldErrors: { return: "Return must be after pickup." },
      ok: false,
    });
  });

  it("formats an instant in Asia/Manila independently of the process timezone", () => {
    expect(formatManilaDateTime("2026-08-13T16:05:00.000Z")).toBe(
      "August 14, 2026 at 12:05 AM",
    );
  });

  it("formats an instant as an Asia/Manila datetime-local value", () => {
    expect(formatManilaDateTimeInput("2026-08-13T16:05:00.000Z")).toBe(
      "2026-08-14T00:05",
    );
  });

  it("normalizes quote identity without colliding adjacent fields", () => {
    expect(
      normalizeQuoteInputKey({
        camera: "11111111-1111-4111-8111-111111111111",
        pickup: "2026-08-14T09:05",
        return: "2026-08-15T09:05",
      }),
    ).toBe(
      '["11111111-1111-4111-8111-111111111111","2026-08-14T09:05","2026-08-15T09:05"]',
    );
  });
});
