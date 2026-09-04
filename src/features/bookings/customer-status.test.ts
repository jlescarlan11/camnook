import { describe, expect, it, vi } from "vitest";
import { bookingStates } from "@/domain/bookings/state-machine";
import { OWNER_REVIEW_TARGET_MS, presentCustomerBookingStatus } from "./customer-status";

describe("customer booking status", () => {
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
