import { describe, expect, it, vi } from "vitest";
import { bookingStates } from "@/domain/bookings/state-machine";
import { customerNextAction, OWNER_REVIEW_TARGET_MS, presentCustomerBookingStatus } from "./customer-status";

describe("customer booking status", () => {
  it("gives an unreviewed past pickup a recovery action without claiming expiry", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    const pickupAt = "2026-09-11T09:00:00+08:00";
    expect(customerNextAction("FOR_REVIEW", undefined, pickupAt, now)).toMatchObject({ action: "Choose new dates", href: "/", title: "Requested pickup time has passed" });
    const status = presentCustomerBookingStatus("FOR_REVIEW", "2026-09-10T00:00:00Z", pickupAt, now);
    expect(status.label).toBe("Awaiting owner review");
    expect(status.nextStep).toContain("pickup time has passed");
    expect(status.target).toBeUndefined();
  });

  it("keeps normal review guidance for future or unknown pickup dates", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    for (const pickupAt of [undefined, "invalid", "2026-09-13T09:00:00+08:00"]) {
      expect(customerNextAction("FOR_REVIEW", undefined, pickupAt, now)).toMatchObject({ action: null, title: "Awaiting owner approval" });
    }
    expect(customerNextAction("FOR_REVIEW", undefined, now.toISOString(), now).action).toBe("Choose new dates");
  });

  it("does not override confirmed or active rentals just because pickup is past", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    expect(customerNextAction("ACTIVE", undefined, "2026-09-11T00:00:00Z", now).title).toBe("Rental in progress");
    expect(customerNextAction("CONFIRMED", undefined, "2026-09-11T00:00:00Z", now).title).toBe("Prepare for pickup");
  });
  it("maps every lifecycle state to one plain-language next step", () => {
    for (const state of bookingStates) {
      const result = presentCustomerBookingStatus(state);
      expect(result.label).not.toBe(state);
      expect(result.nextStep.length).toBeGreaterThan(10);
    }
  });

  it("presents the owner-review target as an expectation", () => {
    const requestedAt = "2026-09-04T00:00:00.000Z";
    const result = presentCustomerBookingStatus("FOR_REVIEW", requestedAt);
    expect(result.label).toBe("Awaiting owner review");
    expect(result.nextStep).toMatch(/aims|not guaranteed/);
    expect(result.target).toContain("Review target");
    expect(OWNER_REVIEW_TARGET_MS).toBe(43_200_000);
  });

  it("fails safely and logs no unknown state value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(presentCustomerBookingStatus("FUTURE_PRIVATE_STATE")).toEqual({
      label: "Status update pending",
      nextStep: "Refresh this page later or contact support before taking action.",
    });
    expect(warn).toHaveBeenCalledWith("customer_booking_status_unmapped");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("FUTURE_PRIVATE_STATE");
  });
});
