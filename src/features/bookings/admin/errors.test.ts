import { describe, expect, it } from "vitest";

import {
  mapApprovalError,
  mapRejectionError,
  validateDecisionInput,
} from "./errors";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

describe("admin booking decision validation", () => {
  it.each(["", "x", " ".repeat(4), "x".repeat(1001)])(
    "rejects an invalid rejection reason without normalizing it into validity: %j",
    (reason) => {
      expect(validateDecisionInput({ bookingId: BOOKING_ID, reason })).toEqual({
        fieldErrors: {
          reason: "Enter a reason between 2 and 1000 characters.",
        },
        ok: false,
      });
    },
  );

  it("trims a valid rejection reason", () => {
    expect(
      validateDecisionInput({ bookingId: BOOKING_ID, reason: "  Not available  " }),
    ).toEqual({ bookingId: BOOKING_ID, ok: true, reason: "Not available" });
  });

  it("rejects a malformed booking identifier", () => {
    expect(validateDecisionInput({ bookingId: "not-a-uuid" })).toEqual({
      fieldErrors: { bookingId: "This booking reference is invalid." },
      ok: false,
    });
  });
});

describe("admin booking decision error mapping", () => {
  it.each([
    ["42501", "approval_unauthorized", "unauthorized"],
    ["P0002", "approval_booking_not_found", "not_found"],
    ["40001", "approval_stale_booking_state", "stale"],
    ["22023", "approval_profile_inactive", "profile_inactive"],
    ["22023", "approval_verification_invalid", "verification_invalid"],
    ["22023", "approval_camera_unavailable", "camera_unavailable"],
    ["22023", "approval_template_unavailable", "template_unavailable"],
    ["22023", "approval_template_invalid", "template_invalid"],
    ["22023", "approval_invalid_period", "invalid_period"],
    ["22023", "approval_price_unrepresentable", "price_unrepresentable"],
    ["23P01", "approval_overlap", "availability_conflict"],
  ])(
    "maps the exact approval contract %s/%s",
    (code, message, category) => {
      expect(mapApprovalError({ code, message })).toBe(category);
    },
  );

  it.each([
    ["22003", "approval_profile_inactive"],
    ["42501", "some unrelated permission detail"],
    ["08006", "database.example.internal"],
  ])("treats non-contract approval details as indeterminate", (code, message) => {
    expect(mapApprovalError({ code, message })).toBe("indeterminate");
  });

  it("maps only the rejection authorization and stale contracts", () => {
    expect(
      mapRejectionError({ code: "42501", message: "admin authorization required" }),
    ).toBe("unauthorized");
    expect(
      mapRejectionError({
        code: "40001",
        message: "booking state changed or transition precondition failed",
      }),
    ).toBe("stale");
    expect(
      mapRejectionError({ code: "22023", message: "private database detail" }),
    ).toBe("indeterminate");
  });
});
